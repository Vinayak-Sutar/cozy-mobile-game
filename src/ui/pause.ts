import type { AudioEngine } from '../feel/audio';
import { icons } from './icons';
import type { Sheet } from './sheet';

export interface PauseAction {
  label: string;
  icon: string;
  primary?: boolean;
  run(): void;
}

/** The pause sheet: big, simple choices. Closing it (any way) resumes play. */
export function openPause(sheet: Sheet, audio: AudioEngine, actions: PauseAction[], onResume: () => void): void {
  const root = document.createElement('div');
  root.className = 'pause-actions';
  const resume: PauseAction = { label: 'Keep playing', icon: icons.play, primary: true, run: () => sheet.close() };
  for (const action of [resume, ...actions]) {
    const button = document.createElement('button');
    button.className = `pill-btn clay${action.primary ? ' primary' : ''}`;
    button.innerHTML = `${action.icon}<span>${action.label}</span>`;
    button.addEventListener('click', () => {
      audio.ui('tap');
      action.run();
    });
    root.appendChild(button);
  }
  sheet.open('Paused', root, onResume);
}
