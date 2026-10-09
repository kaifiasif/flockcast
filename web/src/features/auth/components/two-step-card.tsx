import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSession } from '../api';
import { TwoStepOffDialog } from './two-step-off-dialog';
import { TwoStepSetupDialog } from './two-step-setup-dialog';

export function TwoStepCard() {
  const user = useSession().data?.user;
  const [dialog, setDialog] = useState<'on' | 'off' | null>(null);
  if (!user) return null;
  const toggle = (which: 'on' | 'off') => (open: boolean) => setDialog(open ? which : null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>2-step codes</CardTitle>
        <CardDescription>
          {user.mfa_enabled
            ? 'Logging in asks for your password and a code from your authenticator app.'
            : 'Optional. Ask for a code from an authenticator app as well as your password, so a leaked password is not enough.'}
        </CardDescription>
        <CardAction>
          <Badge variant={user.mfa_enabled ? 'secondary' : 'outline'}>{user.mfa_enabled ? 'On' : 'Off'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {user.mfa_enabled ? (
          <Button variant="outline" onClick={() => setDialog('off')}>
            Turn off
          </Button>
        ) : (
          <Button onClick={() => setDialog('on')}>Turn on 2-step codes</Button>
        )}
      </CardContent>
      <TwoStepSetupDialog open={dialog === 'on'} onOpenChange={toggle('on')} />
      <TwoStepOffDialog open={dialog === 'off'} onOpenChange={toggle('off')} />
    </Card>
  );
}
