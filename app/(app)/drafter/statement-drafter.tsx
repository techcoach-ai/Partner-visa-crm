'use client';

import { useState } from 'react';
import { Check, Copy, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard can be blocked; the text is selectable either way.
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export function StatementDrafter() {
  const [howMet, setHowMet] = useState('');
  const [livingTogether, setLivingTogether] = useState('');
  const [timeline, setTimeline] = useState('');
  const [applicant, setApplicant] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/drafter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timeline,
          how_met: howMet,
          living_together: livingTogether,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Drafting failed.');
      setApplicant(json.applicant_statement);
      setSponsor(json.sponsor_statement);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Drafting failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your relationship</CardTitle>
          <p className="text-sm text-muted-foreground">
            The more specific and dated you are, the better the draft. Only what you write
            here is used — nothing is invented.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="how_met">How and when you met</Label>
            <Textarea
              id="how_met"
              rows={3}
              value={howMet}
              placeholder="Where, when, who introduced you, what happened next."
              onChange={(e) => setHowMet(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="living_together">Living together</Label>
            <Textarea
              id="living_together"
              rows={3}
              value={livingTogether}
              placeholder="When you moved in together, addresses, how you split rent, bills and chores."
              onChange={(e) => setLivingTogether(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeline">Timeline and key milestones</Label>
            <Textarea
              id="timeline"
              rows={10}
              value={timeline}
              placeholder={
                'Dated milestones — first met, became exclusive, met each other’s families, moved in, trips, joint finances, engagement, decisions about the future. Include anything about how you support each other and who knows you as a couple.'
              }
              onChange={(e) => setTimeline(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Gaps come back as [bracketed placeholders] for you to fill in.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button onClick={() => void draft()} disabled={loading || !timeline.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? 'Drafting…' : 'Draft both statements'}
          </Button>
        </CardContent>
      </Card>

      {(applicant || sponsor) && (
        <>
          <Alert variant="warning">
            <AlertDescription>
              These are drafts built from what you wrote. Read every line and correct
              anything that isn&apos;t accurate before you use them — a statement to the
              Department has to be true. Nothing here is submitted anywhere.
            </AlertDescription>
          </Alert>

          {[
            { title: 'Applicant’s statement', value: applicant, set: setApplicant },
            { title: 'Sponsor’s statement', value: sponsor, set: setSponsor },
          ].map(({ title, value, set }) => (
            <Card key={title}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{title}</CardTitle>
                  <CopyButton text={value} />
                </div>
              </CardHeader>
              <CardContent>
                <Textarea
                  rows={16}
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  className="font-mono text-xs leading-relaxed"
                />
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
