// Undo toast — 5 second auto-dismiss, click to undo.
import { escapeHtml } from './helpers.js';

let toastEl = null;
let timeoutId = null;
let currentUndo = null;

function ensureEl() {
    if (toastEl) return toastEl;
    toastEl = document.createElement('div');
    toastEl.className = 'dday-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = `
        <span class="dday-toast-msg"></span>
        <button class="dday-toast-undo" type="button">실행 취소</button>
    `;
    document.body.appendChild(toastEl);
    toastEl.querySelector('.dday-toast-undo').addEventListener('click', () => {
        if (currentUndo) {
            const fn = currentUndo;
            currentUndo = null;
            fn();
        }
        hide();
    });
    return toastEl;
}

function hide() {
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    if (toastEl) toastEl.classList.remove('is-open');
    currentUndo = null;
}

export function showUndoToast(message, undoFn, duration = 5000) {
    const el = ensureEl();
    el.querySelector('.dday-toast-msg').innerHTML = escapeHtml(message);
    currentUndo = undoFn;
    el.classList.add('is-open');
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(hide, duration);
}
