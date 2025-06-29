import { Terminal, type IDisposable } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
// This import injects the necessary CSS into the page.
import 'xterm/css/xterm.css';

// --- Type Definitions ---
// The IDisposable type from xterm is useful for our listener
type NullableDisposable = IDisposable | null;

// --- DOM Element Guards ---
const terminalContainer = document.getElementById('terminal-container');
const connectButton = document.getElementById('connect-button');

if (!terminalContainer || !connectButton) {
  throw new Error('Required DOM elements are missing.');
}

// --- Terminal Setup ---
const fitAddon = new FitAddon();
const term = new Terminal({
  cursorBlink: true,
  convertEol: true,
  fontFamily: 'monospace',
  fontSize: 12,
});
term.loadAddon(fitAddon);
term.open(terminalContainer);
fitAddon.fit();
term.focus();

// --- State Variables with Types ---
let port: SerialPort | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let writer: WritableStreamDefaultWriter<string> | null = null;
let termDataListener: NullableDisposable = null;

// --- Main Application Logic ---
connectButton.addEventListener('click', async () => {
  if (port) {
    await disconnect();
  } else {
    await connect();
  }
});

function debounce(func: () => void, timeout = 50) {
  let timer: number;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(() => { func(); }, timeout);
  };
}

const resizeHandler = debounce(() => fitAddon.fit(), 50);
window.addEventListener('resize', resizeHandler);

async function connect() {
  if ('serial' in navigator) {

    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });

      term.writeln('[SYSTEM] Serial port connected.');
      term.focus();
      updateUiForConnection(true);

      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(port.writable!);
      writer = textEncoder.writable.getWriter();

      const textDecoder = new TextDecoderStream();
      port.readable!.pipeTo(textDecoder.writable);
      reader = textDecoder.readable.getReader();
      
      termDataListener = term.onData(data => {
        if (writer) {
          writer.write(data);
        }
      });

      readLoop();
      
    } catch (error) {
      if (error instanceof Error) {
        term.writeln(`[ERROR] ${error.message}`);
      }
      if (port) {
        await disconnect();
      }
    }
  } else {
    term.writeln('[ERROR] Web Serial API not supported in this browser.');
  }
}

async function readLoop() {
  try {
    while (port?.readable) {
      const { value, done } = await reader!.read();
      if (done) break;
      if (value) term.write(value);
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'NetworkError') {
      console.error(error);
      term.writeln(`\r\n[ERROR] Read loop failed: ${error.message}`);
    }
  } finally {
    reader?.releaseLock();
  }
}

async function disconnect() {
  // Update the UI to give feedback
  updateUiForConnection('disconnecting');
  term.writeln('\r\n[SYSTEM] Port released. Reloading page...');

  // Best-effort attempt to close the port. We don't wait for it.
  // The page reload is what will truly release the OS lock.
  port?.close().catch(() => {}); // Ignore errors

  // Reload the page after a very short delay
  setTimeout(() => {
    location.reload();
  }, 500); // 0.5-second delay
}

function updateUiForConnection(isConnected: boolean) {
  connectButton!.textContent = isConnected ? 'Disconnect' : 'Connect to Serial Device';
}