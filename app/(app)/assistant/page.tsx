import type { Metadata } from 'next';
import { requireApplication } from '@/lib/queries';
import { createClient } from '@/lib/supabase/server';
import { AssistantChat } from './assistant-chat';

export const metadata: Metadata = { title: 'Assistant — Partner Visa CRM' };

export default async function AssistantPage() {
  const application = await requireApplication();
  const supabase = createClient();

  const { data } = await supabase
    .from('ai_messages')
    .select('id, role, content, created_at')
    .eq('application_id', application.id)
    .order('created_at', { ascending: true })
    .limit(100);

  const history = (data ?? []).map((m) => ({
    id: m.id as string,
    role: m.role as 'user' | 'assistant',
    content: m.content as string,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assistant</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers from your own checklist and the published rules for this visa. It will say
          so when something isn&apos;t in that material rather than guessing.
        </p>
      </div>
      <AssistantChat initialMessages={history} />
    </div>
  );
}
