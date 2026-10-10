import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          },
          () => toast.error('Copy did not work here. Select the text and copy it instead.'),
        )
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? 'Copied' : label}
    </Button>
  );
}
