"""
CodeForest extension backend.
Lightweight FastAPI server for analyzing a local workspace directory.
Run: python main.py --port 8765
"""

import argparse
import ast
import hashlib
import json as _json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import tree_sitter_javascript as ts_js
import tree_sitter_typescript as ts_ts
from tree_sitter import Language, Parser, Node

# ─── Language objects ─────────────────────────────────────────────────────────

_JS_LANG = Language(ts_js.language())
_TS_LANG = Language(ts_ts.language_typescript())
_TSX_LANG = Language(ts_ts.language_tsx())

# ─── Constants ────────────────────────────────────────────────────────────────

SUPPORTED_EXTENSIONS = {".py", ".js", ".ts", ".tsx", ".jsx"}
IGNORE_DIRS = {
    "node_modules", ".git", "__pycache__", ".venv", "venv", "env",
    "dist", "build", ".next", "out", "coverage", ".pytest_cache",
    ".mypy_cache", "eggs", ".eggs", "site-packages", ".tox",
}
JS_RESERVED = frozenset({
    "if", "for", "while", "switch", "catch", "function", "class",
    "return", "typeof", "instanceof", "new", "const", "let", "var",
    "import", "export", "from", "async", "await", "yield", "delete",
    "void", "throw", "try", "else", "do", "in", "of",
})

# ─── Pydantic models ──────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    id: str
    label: str
    path: str
    type: str
    code: Optional[str] = None


class GraphEdge(BaseModel):
    source: str
    target: str


class FileGraph(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class AnalyzeRequest(BaseModel):
    path: str  # Absolute path to the workspace root


class AnalyzeResponse(BaseModel):
    top_level_graph: Optional[FileGraph] = None
    file_graphs: Optional[Dict[str, FileGraph]] = None
    workspace_name: Optional[str] = None
    error: Optional[str] = None


# ─── Helper utilities ─────────────────────────────────────────────────────────

def make_node_id(key: str) -> str:
    return hashlib.md5(key.encode()).hexdigest()[:12]


def _ts_find_nodes(node: Node, types: Set[str], results: Optional[List[Node]] = None) -> List[Node]:
    if results is None:
        results = []
    if node.type in types:
        results.append(node)
    for child in node.children:
        _ts_find_nodes(child, types, results)
    return results


def _ts_node_text(node: Node) -> str:
    return node.text.decode("utf-8", errors="replace") if node.text else ""


# ─── File collection ──────────────────────────────────────────────────────────

def collect_files(workspace_dir: str) -> List[str]:
    files = []
    for root, dirs, filenames in os.walk(workspace_dir):
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith(".")]
        for fname in filenames:
            ext = os.path.splitext(fname)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                files.append(os.path.join(root, fname))
    return sorted(files)


# ─── Module resolution ────────────────────────────────────────────────────────

def _try_resolve_module(module_path: str, repo_dir: str) -> Optional[str]:
    candidates = [
        module_path + ".py",
        module_path + ".js",
        module_path + ".ts",
        module_path + ".tsx",
        module_path + ".jsx",
        os.path.join(module_path, "__init__.py"),
        os.path.join(module_path, "index.js"),
        os.path.join(module_path, "index.ts"),
        os.path.join(module_path, "index.tsx"),
    ]
    for c in candidates:
        full = os.path.normpath(os.path.join(repo_dir, c))
        if os.path.isfile(full):
            return full
    return None


_TSCONFIG_ALIAS_CACHE: Dict[str, Dict[str, str]] = {}


def _load_tsconfig_aliases(repo_dir: str) -> Dict[str, str]:
    if repo_dir in _TSCONFIG_ALIAS_CACHE:
        return _TSCONFIG_ALIAS_CACHE[repo_dir]
    aliases: Dict[str, str] = {}
    for name in ("tsconfig.json", "tsconfig.base.json", "tsconfig.app.json"):
        ts_path = os.path.join(repo_dir, name)
        if not os.path.isfile(ts_path):
            continue
        try:
            raw = Path(ts_path).read_text(encoding="utf-8", errors="replace")
            clean = re.sub(r"//[^\n]*", "", raw)
            data = _json.loads(clean)
            paths = data.get("compilerOptions", {}).get("paths", {})
            base_url = data.get("compilerOptions", {}).get("baseUrl", ".")
            for alias_pat, targets in paths.items():
                if not targets:
                    continue
                alias_key = alias_pat.rstrip("*")
                target = targets[0].rstrip("*")
                resolved_target = os.path.normpath(os.path.join(repo_dir, base_url, target))
                aliases[alias_key] = resolved_target
            break
        except Exception:
            continue
    if not aliases:
        for candidate_src in ("src", "app", "frontend/src", "client/src"):
            full = os.path.join(repo_dir, candidate_src)
            if os.path.isdir(full):
                aliases["@/"] = full
                aliases["~/"] = full
                break
    _TSCONFIG_ALIAS_CACHE[repo_dir] = aliases
    return aliases


def _resolve_alias_specifier(spec: str, repo_dir: str) -> Optional[str]:
    aliases = _load_tsconfig_aliases(repo_dir)
    for alias_key, target_dir in aliases.items():
        if spec.startswith(alias_key):
            remainder = spec[len(alias_key):]
            rel = os.path.relpath(os.path.join(target_dir, remainder), repo_dir)
            r = _try_resolve_module(rel, repo_dir)
            if r:
                return r
    return None


# ─── Import extraction ────────────────────────────────────────────────────────

def _extract_py_import_paths(source: str, file_path: str, repo_dir: str) -> List[str]:
    resolved: List[str] = []
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return resolved
    file_dir = os.path.dirname(file_path)
    rel_file_dir = os.path.relpath(file_dir, repo_dir)
    parts = rel_file_dir.split(os.sep) if rel_file_dir != "." else []

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                r = _try_resolve_module(alias.name.replace(".", os.sep), repo_dir)
                if r:
                    resolved.append(r)
        elif isinstance(node, ast.ImportFrom):
            level = node.level or 0
            if level > 0:
                base_parts = parts[: len(parts) - (level - 1)] if len(parts) >= level - 1 else []
                if node.module:
                    mod_path = os.path.join(*base_parts, node.module.replace(".", os.sep)) if base_parts else node.module.replace(".", os.sep)
                    r = _try_resolve_module(mod_path, repo_dir)
                    if r:
                        resolved.append(r)
                else:
                    for alias in node.names:
                        if alias.name == "*":
                            continue
                        name_path = os.path.join(*base_parts, alias.name) if base_parts else alias.name
                        r = _try_resolve_module(name_path, repo_dir)
                        if r:
                            resolved.append(r)
            elif node.module:
                r = _try_resolve_module(node.module.replace(".", os.sep), repo_dir)
                if r:
                    resolved.append(r)
    return resolved


def _extract_js_import_paths(source: str, file_path: str, repo_dir: str) -> List[str]:
    resolved: List[str] = []
    file_dir = os.path.dirname(file_path)
    ext = os.path.splitext(file_path)[1].lower()

    lang = _TSX_LANG if ext == ".tsx" else _TS_LANG if ext == ".ts" else _JS_LANG
    parser = Parser(lang)
    try:
        tree = parser.parse(bytes(source, "utf-8"))
    except Exception:
        return resolved

    import_nodes = _ts_find_nodes(tree.root_node, {"import_statement", "call_expression"})
    specifiers: List[str] = []

    for node in import_nodes:
        if node.type == "import_statement":
            src_node = node.child_by_field_name("source")
            if src_node:
                raw = _ts_node_text(src_node).strip("'\"` ")
                if raw:
                    specifiers.append(raw)
        elif node.type == "call_expression":
            fn = node.child_by_field_name("function")
            if fn and _ts_node_text(fn) in ("require", "import"):
                args = node.child_by_field_name("arguments")
                if args:
                    for child in args.children:
                        if child.type in ("string", "template_string"):
                            raw = _ts_node_text(child).strip("'\"` ")
                            if raw:
                                specifiers.append(raw)

    for spec in specifiers:
        if spec.startswith("."):
            base = os.path.normpath(os.path.join(file_dir, spec))
            rel = os.path.relpath(base, repo_dir)
            r = _try_resolve_module(rel, repo_dir)
        else:
            r = _resolve_alias_specifier(spec, repo_dir)
        if r:
            resolved.append(r)

    return resolved


# ─── Top-level graph builder ──────────────────────────────────────────────────

def build_top_level_graph(files: List[str], workspace_dir: str) -> FileGraph:
    all_files_set = set(files)
    nodes_map: Dict[str, "GraphNode"] = {}
    file_to_id: Dict[str, str] = {}
    edges_set: Set[Tuple[str, str]] = set()

    for f in files:
        node_id = make_node_id(f)
        rel = os.path.relpath(f, workspace_dir)
        basename = os.path.basename(f)
        ext = os.path.splitext(f)[1].lower()
        ftype = "python" if ext == ".py" else "javascript" if ext in {".js", ".jsx"} else "typescript"
        nodes_map[f] = GraphNode(id=node_id, label=basename, path=rel, type=ftype)
        file_to_id[f] = node_id

    for f in files:
        ext = os.path.splitext(f)[1].lower()
        try:
            source = Path(f).read_text(encoding="utf-8", errors="replace")
        except Exception:
            continue
        imports = _extract_py_import_paths(source, f, workspace_dir) if ext == ".py" else _extract_js_import_paths(source, f, workspace_dir)
        for resolved in imports:
            if resolved in all_files_set and resolved != f:
                edges_set.add((f, resolved))

    edges = [
        GraphEdge(source=file_to_id[src], target=file_to_id[tgt])
        for src, tgt in edges_set
        if src in file_to_id and tgt in file_to_id
    ]
    return FileGraph(nodes=list(nodes_map.values()), edges=edges)


# ─── Per-file graph builders ──────────────────────────────────────────────────

def _get_py_source(source: str, node: ast.AST) -> str:
    try:
        seg = ast.get_source_segment(source, node)
        if seg:
            return seg
    except Exception:
        pass
    try:
        lines = source.splitlines()
        start = getattr(node, "lineno", 1) - 1
        end = getattr(node, "end_lineno", start + 1)
        return "\n".join(lines[start:end])
    except Exception:
        return ""


def build_python_file_graph(source: str, rel_path: str) -> FileGraph:
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []
    symbol_ids: Dict[str, str] = {}
    seen_call_edges: Set[Tuple[str, str]] = set()

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return FileGraph(nodes=nodes, edges=edges)

    module_body = tree.body if isinstance(tree, ast.Module) else []
    for stmt in module_body:
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef)):
            name = stmt.name
            nid = make_node_id(rel_path + ":fn:" + name)
            symbol_ids[name] = nid
            nodes.append(GraphNode(id=nid, label=name, path=rel_path, type="function", code=_get_py_source(source, stmt)))
        elif isinstance(stmt, ast.ClassDef):
            cls_name = stmt.name
            cls_id = make_node_id(rel_path + ":cls:" + cls_name)
            symbol_ids[cls_name] = cls_id
            nodes.append(GraphNode(id=cls_id, label=cls_name, path=rel_path, type="class", code=_get_py_source(source, stmt)))
            for item in stmt.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    method_key = f"{cls_name}.{item.name}"
                    method_id = make_node_id(rel_path + ":method:" + method_key)
                    symbol_ids[method_key] = method_id
                    if item.name not in symbol_ids:
                        symbol_ids[item.name] = method_id
                    nodes.append(GraphNode(id=method_id, label=item.name, path=rel_path, type="function", code=_get_py_source(source, item)))
                    edges.append(GraphEdge(source=cls_id, target=method_id))

    class CallVisitor(ast.NodeVisitor):
        def __init__(self, scope_name: Optional[str]) -> None:
            self.scope = scope_name
        def visit_FunctionDef(self, n: ast.FunctionDef) -> None:
            v = CallVisitor(n.name)
            for child in ast.iter_child_nodes(n):
                v.visit(child)
        def visit_AsyncFunctionDef(self, n: ast.AsyncFunctionDef) -> None:
            v = CallVisitor(n.name)
            for child in ast.iter_child_nodes(n):
                v.visit(child)
        def visit_ClassDef(self, n: ast.ClassDef) -> None:
            v = CallVisitor(n.name)
            for child in ast.iter_child_nodes(n):
                v.visit(child)
        def visit_Call(self, n: ast.Call) -> None:
            called_name: Optional[str] = None
            if isinstance(n.func, ast.Name):
                called_name = n.func.id
            elif isinstance(n.func, ast.Attribute):
                called_name = n.func.attr
            if called_name and self.scope and called_name in symbol_ids and self.scope in symbol_ids and called_name != self.scope:
                src_id = symbol_ids[self.scope]
                tgt_id = symbol_ids[called_name]
                pair = (src_id, tgt_id)
                if pair not in seen_call_edges:
                    seen_call_edges.add(pair)
                    edges.append(GraphEdge(source=src_id, target=tgt_id))
            self.generic_visit(n)

    CallVisitor(None).visit(tree)
    return FileGraph(nodes=nodes, edges=edges)


def build_js_ts_file_graph(source: str, rel_path: str, lang: Language) -> FileGraph:
    nodes: List[GraphNode] = []
    edges: List[GraphEdge] = []
    symbol_ids: Dict[str, str] = {}
    seen_call_edges: Set[Tuple[str, str]] = set()

    parser = Parser(lang)
    try:
        source_bytes = bytes(source, "utf-8")
        tree = parser.parse(source_bytes)
    except Exception:
        return FileGraph(nodes=nodes, edges=edges)

    root = tree.root_node

    def node_source(n: Node) -> str:
        return source_bytes[n.start_byte:n.end_byte].decode("utf-8", errors="replace")

    def add_fn(name: str, ts_node: Node) -> str:
        nid = make_node_id(rel_path + ":fn:" + name)
        if name not in symbol_ids:
            symbol_ids[name] = nid
            nodes.append(GraphNode(id=nid, label=name, path=rel_path, type="function", code=node_source(ts_node)))
        return symbol_ids[name]

    def add_cls(name: str, ts_node: Node) -> str:
        nid = make_node_id(rel_path + ":cls:" + name)
        if name not in symbol_ids:
            symbol_ids[name] = nid
            nodes.append(GraphNode(id=nid, label=name, path=rel_path, type="class", code=node_source(ts_node)))
        return symbol_ids[name]

    def process_class_body(cls_name: str, cls_id: str, body: Node) -> None:
        for member in body.children:
            if member.type == "method_definition":
                mname_node = member.child_by_field_name("name")
                if not mname_node:
                    continue
                mname = _ts_node_text(mname_node)
                if not mname:
                    continue
                method_key = f"{cls_name}.{mname}"
                method_id = make_node_id(rel_path + ":method:" + method_key)
                symbol_ids[method_key] = method_id
                if mname not in symbol_ids:
                    symbol_ids[mname] = method_id
                nodes.append(GraphNode(id=method_id, label=mname, path=rel_path, type="function", code=node_source(member)))
                edges.append(GraphEdge(source=cls_id, target=method_id))

    def process_stmt(stmt: Node) -> None:
        t = stmt.type
        if t in ("function_declaration", "generator_function_declaration"):
            name_node = stmt.child_by_field_name("name")
            if name_node:
                name = _ts_node_text(name_node)
                if name:
                    add_fn(name, stmt)
        elif t == "class_declaration":
            name_node = stmt.child_by_field_name("name")
            if not name_node:
                return
            cls_name = _ts_node_text(name_node)
            if not cls_name:
                return
            cls_id = add_cls(cls_name, stmt)
            body = stmt.child_by_field_name("body")
            if body:
                process_class_body(cls_name, cls_id, body)
        elif t in ("lexical_declaration", "variable_declaration"):
            for declarator in _ts_find_nodes(stmt, {"variable_declarator"}):
                name_node = declarator.child_by_field_name("name")
                val_node = declarator.child_by_field_name("value")
                if not name_node:
                    continue
                name = _ts_node_text(name_node)
                if not name or name[0].isdigit():
                    continue
                if val_node and val_node.type in ("arrow_function", "function_expression", "generator_function_expression"):
                    add_fn(name, val_node)

    for child in root.children:
        if child.type == "export_statement":
            inner = next(
                (c for c in child.children if c.type in (
                    "function_declaration", "generator_function_declaration",
                    "class_declaration", "lexical_declaration", "variable_declaration",
                )), None,
            )
            if inner:
                process_stmt(inner)
        else:
            process_stmt(child)

    def get_call_targets(body_node: Node) -> List[str]:
        targets: List[str] = []
        for call in _ts_find_nodes(body_node, {"call_expression"}):
            fn_node = call.child_by_field_name("function")
            if fn_node:
                if fn_node.type == "identifier":
                    targets.append(_ts_node_text(fn_node))
                elif fn_node.type == "member_expression":
                    prop = fn_node.child_by_field_name("property")
                    if prop:
                        targets.append(_ts_node_text(prop))
        return targets

    for fn in _ts_find_nodes(root, {"function_declaration", "arrow_function", "function_expression", "generator_function_declaration", "method_definition"}):
        name_node = fn.child_by_field_name("name")
        scope_name: Optional[str] = None
        if name_node:
            scope_name = _ts_node_text(name_node)
        else:
            parent = fn.parent
            if parent and parent.type == "variable_declarator":
                pname = parent.child_by_field_name("name")
                if pname:
                    scope_name = _ts_node_text(pname)
        if scope_name and scope_name in symbol_ids:
            body = fn.child_by_field_name("body")
            if body:
                for called in get_call_targets(body):
                    if called and called in symbol_ids and called != scope_name and called not in JS_RESERVED:
                        src_id = symbol_ids[scope_name]
                        tgt_id = symbol_ids[called]
                        pair = (src_id, tgt_id)
                        if pair not in seen_call_edges:
                            seen_call_edges.add(pair)
                            edges.append(GraphEdge(source=src_id, target=tgt_id))

    return FileGraph(nodes=nodes, edges=edges)


def build_file_graph(f: str, workspace_dir: str) -> FileGraph:
    rel = os.path.relpath(f, workspace_dir)
    ext = os.path.splitext(f)[1].lower()
    try:
        source = Path(f).read_text(encoding="utf-8", errors="replace")
    except Exception:
        return FileGraph(nodes=[], edges=[])

    if ext == ".py":
        return build_python_file_graph(source, rel)
    elif ext == ".tsx":
        return build_js_ts_file_graph(source, rel, _TSX_LANG)
    elif ext == ".ts":
        return build_js_ts_file_graph(source, rel, _TS_LANG)
    else:
        return build_js_ts_file_graph(source, rel, _JS_LANG)


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="CodeForest Extension Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    workspace_dir = req.path
    if not os.path.isdir(workspace_dir):
        return AnalyzeResponse(error=f"Directory not found: {workspace_dir}")

    try:
        files = collect_files(workspace_dir)
        if not files:
            return AnalyzeResponse(
                error="No supported source files found (.py, .js, .ts, .tsx, .jsx).",
                workspace_name=os.path.basename(workspace_dir),
            )

        top_level = build_top_level_graph(files, workspace_dir)
        file_graphs: Dict[str, FileGraph] = {}
        for f in files:
            node_id = make_node_id(f)
            fg = build_file_graph(f, workspace_dir)
            if fg.nodes:
                file_graphs[node_id] = fg

        return AnalyzeResponse(
            top_level_graph=top_level,
            file_graphs=file_graphs,
            workspace_name=os.path.basename(workspace_dir),
        )
    except Exception as e:
        return AnalyzeResponse(error=str(e))


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    print(f"[CodeForest] Backend starting on {args.host}:{args.port}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
