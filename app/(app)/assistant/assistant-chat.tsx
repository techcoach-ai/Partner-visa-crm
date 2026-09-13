'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'Which of my required items are still outstanding?',
  'Which pillar is weakest right now?',
  'What counts as evidence for the household pillar?',
  'What do I need for the Form 888 declarations?',
];

export function AssistantChat({ initialMessages }: { initialMessages: Message[] }) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    setError(null);
    setInput('');
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: trimmed }]);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'The assistant could not answer.');

      setMessages((prev) => [
        ...prev,
        { id: `local-${Date.now()}-a`, role: 'assistant', content: json.answer },
      ]);
      if (json.warning) setError(json.warning);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant could not answer.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          {messages.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-muted-foreground">Ask about your application.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-4">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {m.content}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {loading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Thinking…
            </p>
          )}
          <div ref={endRef} />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="space-y-2"
      >
        <Textarea
          rows={3}
          value={input}
          placeholder="Ask about your checklist, the pillars, or what a requirement means…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void ask(input);
            }
          }}
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Not migration advice. Verify anything authoritative at immi.homeaffairs.gov.au.
          </p>
          <Button type="submit" size="sm" disabled={loading || !input.trim()}>
            <Send className="h-4 w-4" />
            Send
          </Button>
        </div>
      </form>
    </div>
  );
}
