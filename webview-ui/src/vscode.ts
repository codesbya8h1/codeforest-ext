// Acquire VS Code API (must be called only once per webview lifetime)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function acquireVsCodeApi(): any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _vscode: any;

export function getVSCode() {
  if (!_vscode) {
    _vscode = acquireVsCodeApi();
  }
  return _vscode;
}

export function postMessage(msg: object) {
  getVSCode().postMessage(msg);
}
