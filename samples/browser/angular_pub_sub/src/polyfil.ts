// Add shim for Global to make Node libraries work.
// https://github.com/angular/angular-cli/issues/9827#issuecomment-386154063
(window as any).global = window;
export {}
