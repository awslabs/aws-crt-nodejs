import buffer from 'buffer';
import process from 'process';

// Hack to get mqtt package work with Webpack 5
(window as any).Buffer = buffer.Buffer;
(window as any).process = process;

export {};