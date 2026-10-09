/** Hands a draft from one screen to the composer (the launch advisor's post), once, through this tab only. */
const KEY = 'flockcast:draft';

export function handOffDraft(text: string): void {
  try {
    sessionStorage.setItem(KEY, text);
  } catch {
    // storage can be blocked; the composer then just starts empty
  }
}

export function takeDraft(): string {
  try {
    const text = sessionStorage.getItem(KEY) ?? '';
    sessionStorage.removeItem(KEY);
    return text;
  } catch {
    return '';
  }
}
