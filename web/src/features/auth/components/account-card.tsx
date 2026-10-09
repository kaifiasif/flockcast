import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/format';
import { useLogout, useSession } from '../api';
import { PasswordDialog } from './password-dialog';

export function AccountCard() {
  const user = useSession().data?.user;
  const logout = useLogout();
  const [changing, setChanging] = useState(false);
  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Your projects, rehearsals and API keys belong to this account. Nobody else on this server can see them.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd className="truncate">{user.email}</dd>
          <dt className="text-muted-foreground">Member since</dt>
          <dd>{formatDate(user.created_at)}</dd>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setChanging(true)}>
            Change password
          </Button>
          <Button variant="ghost" onClick={() => logout.mutate(undefined, { onError: (e) => toast.error(errorMessage(e)) })}>
            Log out
          </Button>
        </div>
      </CardContent>
      <PasswordDialog open={changing} onOpenChange={setChanging} />
    </Card>
  );
}
