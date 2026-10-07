/**
 * Sequence item format:
 * - Phrase: {"type":"phrase", "id":"hello", "label":"Hello", "clip":"hello_clip"}
 * - Letter: {"type":"letter", "id":"a", "label":"A", "clip":"letter_a_clip"}
 * - Pause: {"type":"pause", "ms": 300}
 */
export type SignSequenceItem =
  | {
      type: 'phrase';
      id: string;
      label: string;
      clip: string;
      icon?: string;
    }
  | {
      type: 'letter';
      id: string;
      label: string;
      clip: string;
    }
  | {
      type: 'pause';
      ms: number;
    };

/**
 * Built-in dictionary of common words for offline mode:
 * I, need, doctor, please, hello, help, yes, no, bank, account, open, wait, sorry, water, thank you
 */
export const OFFLINE_WORD_DICTIONARY: Record<
  string,
  { label: string; clip: string; icon?: string }
> = {
  i: { label: 'I', clip: 'i_clip', icon: '👤' },
  need: { label: 'Need', clip: 'need_clip', icon: '🤲' },
  doctor: { label: 'Doctor', clip: 'doctor_clip', icon: '🩺' },
  please: { label: 'Please', clip: 'please_clip', icon: '🙏' },
  hello: { label: 'Hello', clip: 'hello_clip', icon: '👋' },
  help: { label: 'Help', clip: 'help_clip', icon: '🆘' },
  yes: { label: 'Yes', clip: 'yes_clip', icon: '👍' },
  no: { label: 'No', clip: 'no_clip', icon: '👎' },
  bank: { label: 'Bank', clip: 'bank_clip', icon: '🏦' },
  account: { label: 'Account', clip: 'account_clip', icon: '📋' },
  open: { label: 'Open', clip: 'open_clip', icon: '🚪' },
  wait: { label: 'Wait', clip: 'wait_clip', icon: '✋' },
  sorry: { label: 'Sorry', clip: 'sorry_clip', icon: '🙇' },
  water: { label: 'Water', clip: 'water_clip', icon: '💧' },
  'thank you': { label: 'Thank You', clip: 'thank_you_clip', icon: '🙏' },
  thank: { label: 'Thank', clip: 'thank_clip', icon: '🙏' },
  you: { label: 'You', clip: 'you_clip', icon: '👉' },
};

/**
 * Builds sign sequence offline using built-in dictionary of common words,
 * spelling unknown words letter-by-letter with pause items between words.
 * Exactly matches webhook sequence format:
 * ({"type":"phrase","id","label","clip"}, {"type":"letter",...}, {"type":"pause","ms":300})
 */
export function buildOfflineSignSequence(text: string): SignSequenceItem[] {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return [
      {
        type: 'phrase',
        id: 'hello',
        label: 'Hello',
        clip: 'hello_clip',
        icon: '👋',
      },
    ];
  }

  const sequence: SignSequenceItem[] = [];

  // Split into tokens/words
  // Handle two-word phrase 'thank you' first
  const words = normalized.replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  let idx = 0;

  while (idx < words.length) {
    // Check two-word combo 'thank you'
    if (idx + 1 < words.length && words[idx] === 'thank' && words[idx + 1] === 'you') {
      sequence.push({
        type: 'phrase',
        id: 'thank_you',
        label: 'Thank You',
        clip: 'thank_you_clip',
        icon: '🙏',
      });
      idx += 2;
      if (idx < words.length) {
        sequence.push({ type: 'pause', ms: 300 });
      }
      continue;
    }

    const word = words[idx];
    if (OFFLINE_WORD_DICTIONARY[word]) {
      const match = OFFLINE_WORD_DICTIONARY[word];
      sequence.push({
        type: 'phrase',
        id: word,
        label: match.label,
        clip: match.clip,
        icon: match.icon,
      });
    } else {
      // Spell unknown word letter-by-letter
      const letters = word.split('');
      for (const char of letters) {
        sequence.push({
          type: 'letter',
          id: char,
          label: char.toUpperCase(),
          clip: `letter_${char}_clip`,
        });
      }
    }

    idx++;
    if (idx < words.length) {
      sequence.push({ type: 'pause', ms: 300 });
    }
  }

  return sequence.length > 0
    ? sequence
    : [
        {
          type: 'phrase',
          id: 'hello',
          label: 'Hello',
          clip: 'hello_clip',
          icon: '👋',
        },
      ];
}
