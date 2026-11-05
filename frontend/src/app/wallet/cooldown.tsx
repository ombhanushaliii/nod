import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, IconCircle, KV, Screen, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { capLeft } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { useScamReports } from '@/hooks/api';
import { goWalletHome, useBackGoesHome } from '@/hooks/nav';
import { m0, when } from '@/lib/format';
import { colors } from '@/theme';

/** New person: up to $10 in the first 24h; the rest unlocks later (docs D3, rule 4). */
export default function Cooldown() {
  const now = useNow();
  const draft = useStore((s) => s.draft);
  const result = useStore((s) => s.result);
  const payees = useStore((s) => s.payees);
  const payments = useStore((s) => s.payments);
  const setDraft = useStore((s) => s.setDraft);
  const tn = useStore(trusteeName);
  const reports = useScamReports(draft?.address);
  useBackGoesHome();

  const approved = !!result?.reqId;
  const left = draft?.address ? capLeft({ payees, payments }, draft.address, now) : 10;
  const name = draft?.name ?? '';
  const amount = draft?.amount;

  const title = approved ? `${tn} said yes` : left > 0 ? `${m0(left)} left for now` : 'Limit reached for now';
  const body = approved
    ? `${name} is new, so the payment unlocks after 24 hours.`
    : `${name || 'This person'} is new. For the first 24 hours you can send up to $10 in total${left < 10 ? ` (${m0(left)} left)` : ''}. The full ${amount ? m0(amount) : 'amount'} unlocks later.`;

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <IconCircle icon="◷" bg={colors.accBg} fg={colors.accFg} fontSize={40} />
        <Txt size={28} w={800} ls={-0.03} align="center">
          {title}
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub} align="center" style={{ maxWidth: 310 }}>
          {body}
        </Txt>
      </View>
      <Card style={{ marginBottom: 14 }}>
        <KV k="Payment" v={`${amount ? m0(amount) : ''} to ${name}`} />
        <KV k="Unlocks" v={result?.unlockAt ? when(result.unlockAt, now) : ''} last />
      </Card>
      {reports.unverified > 0 && reports.verified === 0 && (
        <Txt size={13} lh={1.45} color={colors.sub} style={{ paddingHorizontal: 4, paddingBottom: 12 }}>
          {reports.unverified} unverified reports mention this address. We couldn&apos;t confirm them, so they don&apos;t block it.
        </Txt>
      )}
      <View style={{ gap: 8 }}>
        {!approved && left > 0 && draft && (
          <Button
            label={`Send ${m0(left)} now`}
            onPress={() => {
              setDraft({ ...draft, amount: left });
              router.replace('/wallet/checking');
            }}
          />
        )}
        <Button label={approved ? 'OK' : 'Send full amount later'} variant={approved ? 'dark' : 'soft'} height={52} size={16} onPress={goWalletHome} />
      </View>
    </Screen>
  );
}
