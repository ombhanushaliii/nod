import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useStore } from '@/data/store';
import type { Role } from '@/data/types';
import { useAuth, useBalance } from '@/hooks/api';
import { haptic } from '@/lib/haptics';
import { money } from '@/lib/format';
import { colors } from '@/theme';
import { isDemo } from '@/wallet/config';
import { Avatar } from './Avatar';
import { Sheet } from './Sheet';
import { Tap } from './Tap';
import { Txt } from './Txt';

type Props = {
  /** Where the gear goes. No gear without it (the invite screens have no settings yet). */
  settings?: Href;
  /** Trustee invites waiting, on the screens that list them. */
  invites?: number;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The person behind this account: their Google name, else the name they gave as a trustee, else their handle. */
function useIdentity() {
  const { session, role } = useAuth();
  const username = useStore((s) => s.username);
  const ownTrusteeName = useStore((s) => s.tDisplayName);
  const current: Role = role === 'trustee' ? 'trustee' : 'user';
  const handle = username ? `@${username}` : '';
  const google = session?.name?.trim() ?? '';
  const email = session?.email ?? '';
  const name = google || (current === 'trustee' ? ownTrusteeName.trim() : '') || handle || email.split('@')[0] || 'You';
  return { current, handle, name, email, isHandle: name === handle };
}

/**
 * The top of each home: who you are, which side of the app you're on, and the
 * way to the other side. Someone who is both a wallet user and a trustee taps
 * their name to switch; everyone else sees the same header, without the switch.
 */
export function AccountHeader({ settings, invites = 0 }: Props) {
  const { role, switchRole } = useAuth();
  const { current, handle, name, isHandle } = useIdentity();
  const people = useStore((s) => s.people.length);
  const links = useStore((s) => s.trusteeLinks);
  const avatar = useStore((s) => (current === 'trustee' ? s.trusteeAvatar : s.userAvatar));
  const [open, setOpen] = useState(false);

  // A trustee can always open their own wallet; a wallet user sees the switch once they look after someone or are invited to.
  const canSwitch = !isDemo && !!role && (current === 'trustee' || links > 0);

  let line: string;
  if (current === 'trustee') {
    line = people > 0 ? `Trustee · ${plural(people, 'person', 'people')}` : invites > 0 ? `Trustee · ${plural(invites, 'invite', 'invites')}` : 'Trustee';
  } else if (canSwitch) {
    line = handle && !isHandle ? `Wallet · ${handle}` : 'Your wallet';
  } else {
    line = handle && !isHandle ? handle : 'Your wallet';
  }

  const identity = (
    <>
      <Avatar index={avatar} size={44} />
      <View style={{ flexShrink: 1, gap: 1 }}>
        <Txt size={17} w={800} ls={-0.01} numberOfLines={1}>
          {name}
        </Txt>
        <View style={styles.line}>
          <Txt size={13} w={700} color={canSwitch ? colors.softInk : colors.sub} numberOfLines={1} style={{ flexShrink: 1 }}>
            {line}
          </Txt>
          {canSwitch && (
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={colors.softInk} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M6 9l6 6 6-6" />
            </Svg>
          )}
        </View>
      </View>
    </>
  );

  const choose = (next: Role) => {
    setOpen(false);
    if (next === current) return;
    haptic('selection');
    // A choice made here wins over the automatic one at sign-in.
    useStore.setState({ roleLanded: true });
    // Let the sheet slide away before the screens change.
    setTimeout(() => switchRole(next), 260);
  };

  return (
    <View style={styles.header}>
      {canSwitch ? (
        <Tap
          onPress={() => setOpen(true)}
          pressedScale={0.97}
          style={[styles.identity, styles.pill]}
          accessibilityLabel={`${name}, ${line}. Switch view`}
          accessibilityHint="Choose between your wallet and the people you look after">
          {identity}
        </Tap>
      ) : (
        <View style={styles.identity} accessible accessibilityLabel={`${name}, ${line}`}>
          {identity}
        </View>
      )}

      {settings && (
        <Tap onPress={() => router.push(settings)} accessibilityLabel="Settings" pressedScale={0.9} style={styles.gear}>
          <GearIcon />
        </Tap>
      )}

      {canSwitch && (
        <Sheet visible={open} onClose={() => setOpen(false)} gap={12}>
          <SwitchSheet current={current} invites={invites} onChoose={choose} />
        </Sheet>
      )}
    </View>
  );
}

/** Only mounted while the sheet is open, so the balance is read then and not on every home. */
function SwitchSheet({ current, invites, onChoose }: { current: Role; invites: number; onChoose: (role: Role) => void }) {
  const { name, email, handle } = useIdentity();
  const onboarded = useStore((s) => s.onboarded);
  const people = useStore((s) => s.people);
  const links = useStore((s) => s.trusteeLinks);
  const { balance, hasBalance } = useBalance();

  const initials = (name.startsWith('@') ? name.slice(1) : name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  const walletSub = !onboarded ? 'Set it up to send and receive' : hasBalance ? `${handle} · ${money(balance)}` : handle || 'Send and receive';
  const first = people[0]?.username;
  const trusteeSub =
    people.length > 1 ? `Looking after ${people.length} people`
    : people.length === 1 ? (first ? `Looking after @${first}` : 'Looking after 1 person')
    : invites > 0 || links > 0 ? 'An invite is waiting for you'
    : 'Check payments for someone you trust';

  return (
    <>
      <View style={styles.account}>
        <View style={styles.initials}>
          <Txt size={18} w={800} color={colors.white}>
            {initials || '·'}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={19} w={800} ls={-0.015} numberOfLines={1}>
            {name}
          </Txt>
          <Txt size={13} color={colors.sub} numberOfLines={1}>
            {email ? `${email} · Google` : 'Signed in with Google'}
          </Txt>
        </View>
      </View>

      <Txt size={12} w={800} ls={0.06} color={colors.sub} style={{ paddingHorizontal: 4, paddingTop: 2 }}>
        VIEW AS
      </Txt>

      <ViewOption
        selected={current === 'user'}
        title="Your wallet"
        sub={walletSub}
        tile={colors.accBg}
        icon={<WalletIcon />}
        onPress={() => onChoose('user')}
      />
      <ViewOption
        selected={current === 'trustee'}
        title="Trustee"
        sub={trusteeSub}
        tile={colors.soft}
        icon={<ShieldIcon />}
        onPress={() => onChoose('trustee')}
      />

      <Txt size={13} lh={1.45} color={colors.sub} style={{ paddingHorizontal: 4, paddingTop: 2 }}>
        Same Google account. Your wallet and the people you look after stay separate, and you can switch any time.
      </Txt>
    </>
  );
}

function ViewOption({ selected, title, sub, tile, icon, onPress }: {
  selected: boolean; title: string; sub: string; tile: string; icon: React.ReactNode; onPress: () => void;
}) {
  return (
    <Tap
      onPress={onPress}
      pressedScale={0.98}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${title}. ${sub}`}
      style={[styles.option, selected ? styles.optionOn : styles.optionOff]}>
      <View style={[styles.tile, { backgroundColor: tile }]}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Txt size={17} w={700}>
          {title}
        </Txt>
        <Txt size={13} color={colors.sub} numberOfLines={1}>
          {sub}
        </Txt>
      </View>
      {selected ? (
        <View style={styles.check}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12l5 5 9-10" />
          </Svg>
        </View>
      ) : (
        <View style={styles.radio} />
      )}
    </Tap>
  );
}

function WalletIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.accFg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" />
      <Path d="M4 7V6a2 2 0 0 1 2-2h10" />
      <Circle cx={16} cy={13.5} r={1.2} />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.softInk} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6l7-3z" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

function GearIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1, minHeight: 52 },
  pill: {
    paddingVertical: 4, paddingLeft: 4, paddingRight: 16, marginLeft: -4, borderRadius: 999, backgroundColor: colors.white,
    shadowColor: colors.ink, shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gear: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.ink, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  account: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 6, paddingBottom: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  initials: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 20, borderWidth: 1.5 },
  optionOn: { borderColor: colors.acc, backgroundColor: colors.white },
  optionOff: { borderColor: colors.line, backgroundColor: colors.bg },
  tile: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  check: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.acc, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.line, backgroundColor: colors.white },
});
