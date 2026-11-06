import { router } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, IconCircle, KV, Screen, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { approvalEnds } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { useApprovalStatus } from '@/hooks/api';
import { goWalletHome, useBackGoesHome } from '@/hooks/nav';
import { dur, money, when } from '@/lib/format';
import { colors, tones } from '@/theme';
import { isDemo } from '@/wallet/config';

type View_ = {
  icon: string;
  iconSize?: number;
  bg: string;
  fg: string;
  anim: 'pop' | 'pulse' | 'none';
  title: string;
  body: string;
  primary?: { label: string; onPress: () => void };
  done: string;
};

/** Waiting on the trustee, then: allowed (maybe locked 24h), denied, or expired. */
export default function Waiting() {
  const now = useNow();
  const id = useStore((s) => s.waitingId);
  const req = useStore((s) => s.requests.find((r) => r.id === s.waitingId));
  const tn = useStore(trusteeName);
  const { setDraft, setResult, resetAnswers, dismissRequest } = useStore.getState();
  const state = useApprovalStatus(id, now);
  useBackGoesHome();

  if (!req || !state) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <Button label="Back to home" variant="soft" onPress={goWalletHome} />
      </Screen>
    );
  }

  const validFrom = req.validFrom ?? 0;
  const ends = approvalEnds(req);
  const draft = { address: req.address ?? '', name: req.name ?? '', amount: req.amount ?? 0 };
  const resume = () => {
    setDraft(draft);
    if (!isDemo && req.paymentId) {
      // The OK is for this exact payment, so send it as is (a new check would be a new payment).
      setResult({ verdict: 'safe', paymentId: req.paymentId });
      router.replace('/wallet/review');
      return;
    }
    setResult(null);
    router.replace('/wallet/checking');
  };
  const askAgain = () => {
    dismissRequest(req.id);
    setDraft(draft);
    if (!isDemo) {
      // Live: a fresh check makes a fresh payment to ask about.
      setResult(null);
      router.replace('/wallet/checking');
      return;
    }
    setResult({ verdict: 'needs_trustee', reasons: req.reasons, why: req.why });
    resetAnswers();
    router.replace('/wallet/questions');
  };

  let v: View_;
  if (state === 'pending') {
    v = {
      icon: '•••',
      iconSize: 24,
      bg: colors.accBg,
      fg: colors.accFg,
      anim: 'pulse',
      title: `Waiting on ${tn}`,
      body: `We let ${tn} know. You'll get a notification as soon as they answer.`,
      done: 'Back to home',
    };
  } else if (state === 'allowed' && now < validFrom) {
    v = {
      icon: '✓',
      ...tones.green,
      anim: 'pop',
      title: `${tn} said yes`,
      body: `${req.name} is new, so it unlocks ${when(validFrom, now)}. Then you can send it whenever you're ready.`,
      done: 'OK',
    };
  } else if (state === 'allowed' && now < ends) {
    v = {
      icon: '✓',
      ...tones.green,
      anim: 'pop',
      title: `${tn} said yes`,
      body: `You can send it now. This OK works once, for the next ${dur(ends - now)}.`,
      primary: { label: 'Continue', onPress: resume },
      done: 'Later',
    };
  } else if (state === 'allowed') {
    v = {
      icon: '◷',
      ...tones.gray,
      anim: 'none',
      title: 'Approval expired',
      body: 'The 1-hour window passed. Ask again if you still want to send.',
      primary: { label: 'Ask again', onPress: askAgain },
      done: 'Not now',
    };
  } else if (state === 'denied') {
    v = {
      icon: '✕',
      ...tones.red,
      anim: 'pop',
      title: `${tn} said no`,
      body: 'The payment won’t go out. They reported the address, so other wallets are warned too.',
      done: 'OK',
    };
  } else {
    v = {
      icon: '◷',
      ...tones.gray,
      anim: 'none',
      title: 'Request expired',
      body: `${tn} didn't answer in time.`,
      primary: { label: 'Ask again', onPress: askAgain },
      done: 'Not now',
    };
  }

  const finished = state === 'denied' || state === 'expired' || (state === 'allowed' && now >= ends);
  const done = () => {
    if (finished) dismissRequest(req.id);
    goWalletHome();
  };

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <IconCircle key={v.title} icon={v.icon} bg={v.bg} fg={v.fg} fontSize={v.iconSize ?? 36} anim={v.anim} halo />
        <Txt size={28} w={800} ls={-0.03} align="center">
          {v.title}
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub} align="center" style={{ maxWidth: 310 }}>
          {v.body}
        </Txt>
      </View>
      <Card style={{ marginBottom: 14 }}>
        <KV k="Payment" v={`${money(req.amount ?? 0)} to ${req.name}`} last />
      </Card>
      <View style={{ gap: 8 }}>
        {v.primary && <Button label={v.primary.label} onPress={v.primary.onPress} />}
        <Button label={v.done} variant="soft" height={50} size={16} onPress={done} />
      </View>
    </Screen>
  );
}
