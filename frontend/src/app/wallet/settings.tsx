import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar, AvatarPicker, BackButton, Button, Card, Chip, DemoTools, KV, Label, ScrollScreen, Sheet, SignOutSheet, Tap, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { isValidUsername, modeLabel, reqState, sentToday, TAKEN_USERNAMES } from '@/data/engine';
import { trusteeName, useStore } from '@/data/store';
import { useAuth, useRules, useWalletSetup } from '@/hooks/api';
import { m0, short } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors, font, tones } from '@/theme';

export default function Settings() {
  const now = useNow();
  const { session, signOut, walletAddress, mode } = useAuth();
  const setup = useWalletSetup();
  const [setupBusy, setSetupBusy] = useState(false);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const R = useRules();
  const s = useStore();
  const tn = trusteeName(s);
  const active = s.trusteeStatus === 'active';
  const [nameOpen, setNameOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Key export is itself an approval request (docs D2 mitigation).
  const exportReq = s.requests.find((r) => r.kind === 'export');
  const exS = exportReq ? reqState(exportReq, now) : null;
  const exportSub = !exportReq
    ? `Needs ${tn}'s OK`
    : exS === 'pending'
      ? `Waiting on ${tn}`
      : exS === 'allowed' && !exportReq.used
        ? 'Allowed · tap to view once'
        : exS === 'denied'
          ? `${tn} said no · tap to ask again`
          : exS === 'expired'
            ? 'Request expired · tap to ask again'
            : `Needs ${tn}'s OK`;

  const onExport = () => {
    if (mode !== 'demo') { router.push('/wallet/export-key'); return; }
    if (exS === 'pending') return haptic('error');
    if (exportReq && exS === 'allowed' && !exportReq.used) {
      s.consumeExport(exportReq.id);
      router.push('/wallet/export-key');
      return;
    }
    setExportOpen(true);
  };

  return (
    <ScrollScreen
      top={
        <View style={styles.top}>
          <BackButton onPress={() => router.back()} />
        </View>
      }
      contentStyle={{ paddingTop: 0, gap: 20 }}>
      <Txt size={30} w={800} ls={-0.03}>
        Settings
      </Txt>

      <View style={{ gap: 18 }}>
        <View style={{ alignSelf: 'center' }}>
          <Avatar index={s.userAvatar} size={92} />
        </View>
        <View style={{ gap: 12 }}>
          <Label>AVATAR</Label>
          <AvatarPicker value={s.userAvatar} onChange={s.setUserAvatar} />
        </View>
      </View>

      <Card>
        <View style={[styles.row, styles.divider, { paddingVertical: 10 }]}>
          <Txt color={colors.sub}>Username</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt w={600}>@{s.username}</Txt>
            <Tap onPress={() => setNameOpen(true)} accessibilityLabel="Edit username" style={styles.edit}>
              <PencilIcon />
            </Tap>
          </View>
        </View>
        <KV k="Signed in with" v={<Txt w={600}>{session?.method ?? 'Google'}</Txt>} />
        <KV
          k="Email"
          last
          v={
            <Txt w={600} numberOfLines={1} style={{ flexShrink: 1 }}>
              {session?.email}
            </Txt>
          }
        />
      </Card>

      <View style={{ gap: 8 }}>
        <Label style={{ paddingHorizontal: 4 }}>SAFETY</Label>
        <Card>
          <View style={[styles.row, styles.divider, { gap: 12 }]}>
            <Avatar index={s.trusteeAvatar} size={36} />
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt w={700}>{tn}</Txt>
              <Txt size={13} color={colors.sub} numberOfLines={1}>
                {s.trusteeContact}
              </Txt>
            </View>
            <Chip label={active ? 'Active' : 'Invited'} tone={active ? 'green' : 'amber'} />
          </View>
          <KV k={`Asks ${tn} above`} v={<Txt w={600}>{m0(R.limit)}</Txt>} />
          <KV k="How often" v={<Txt w={600}>{modeLabel(R.mode)}</Txt>} />
          <View style={styles.row}>
            <View style={{ gap: 2 }}>
              <Txt color={colors.sub}>Daily max</Txt>
              <Txt size={13} color={colors.sub}>
                {m0(Math.max(0, R.daily - sentToday(s, now)))} left today
              </Txt>
            </View>
            <Txt w={600}>{m0(R.daily)}</Txt>
          </View>
        </Card>
        <Txt size={13} lh={1.45} color={colors.sub} style={{ paddingHorizontal: 4 }}>
          Set by {tn}. Only your trustee can change these.
        </Txt>
      </View>

      <View style={{ gap: 8 }}>
        <Label style={{ paddingHorizontal: 4 }}>WALLET</Label>
        <Card>
          <KV k="Address" v={<Txt size={15} w={600} tabular>{short(walletAddress)}</Txt>} />
          <Tap feedback="opacity" onPress={onExport} style={styles.row} accessibilityLabel={`Export wallet key. ${exportSub}`}>
            <View style={{ gap: 2 }}>
              <Txt w={600}>Export wallet key</Txt>
              <Txt size={13} color={colors.sub}>
                {exportSub}
              </Txt>
            </View>
            <Txt size={20} color={colors.chevron}>
              ›
            </Txt>
          </Tap>
        </Card>
      </View>

      <DemoTools />
      {mode !== 'demo' && <View style={{ gap: 8 }}>
        <Button label={setupBusy ? 'Connecting…' : 'Connect sponsored payments'} disabled={setupBusy} variant="soft" onPress={() => {
          setSetupBusy(true); setSetupMessage(null);
          void setup().then(() => setSetupMessage('Your wallet is connected for sponsored USDC payments.'))
            .catch((err) => setSetupMessage(err instanceof Error ? err.message : 'Could not connect your wallet.'))
            .finally(() => setSetupBusy(false));
        }} />
        {setupMessage && <Txt size={14} color={colors.sub}>{setupMessage}</Txt>}
      </View>}

      <Button
        label="Sign out"
        variant="signOut"
        height={54}
        size={16}
        style={{ marginTop: 4 }}
        onPress={() => {
          haptic('medium');
          setSignOutOpen(true);
        }}
      />

      <UsernameSheet visible={nameOpen} onClose={() => setNameOpen(false)} />

      <Sheet visible={exportOpen} onClose={() => setExportOpen(false)} gap={16} dim={0.32}>
        <View style={{ gap: 8, paddingTop: 6 }}>
          <Txt size={24} w={800} ls={-0.025}>
            Export your wallet key?
          </Txt>
          <Txt size={16} lh={1.5} color={colors.sub}>
            Anyone with your key controls your money. Scammers often ask for it, so {tn} has to OK this first.
          </Txt>
        </View>
        <View style={{ gap: 8, paddingTop: 4 }}>
          <Button
            label={`Ask ${tn}`}
            onPress={() => {
              s.requestExport();
              setExportOpen(false);
            }}
          />
          <Button label="Cancel" variant="soft" height={52} size={16} onPress={() => setExportOpen(false)} />
        </View>
      </Sheet>

      <SignOutSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          haptic('heavy');
          setSignOutOpen(false);
          void signOut();
        }}
        avatar={s.userAvatar}
        name={`@${s.username}`}
        detail={session?.email ?? ''}
        body="Your money and trustee stay safe. Sign back in with Google anytime."
      />
    </ScrollScreen>
  );
}

function PencilIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.accFg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 20h4L19 9l-4-4L4 16v4z" />
      <Path d="M13.5 6.5l4 4" />
    </Svg>
  );
}

/** Change username, with live validation and suggestions. */
function UsernameSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const u = useStore((s) => s.username);
  const avatar = useStore((s) => s.userAvatar);
  const setUsername = useStore((s) => s.setUsername);
  const [draft, setDraft] = useState(u);
  const [lastOpen, setLastOpen] = useState(false);
  // Reset the draft each time the sheet opens.
  if (visible !== lastOpen) {
    setLastOpen(visible);
    if (visible) setDraft(u);
  }

  const valid = isValidUsername(draft);
  const taken = TAKEN_USERNAMES.includes(draft);
  const ok = valid && !taken && draft !== u;
  const same = draft === u;
  const ring = same ? 'transparent' : ok ? tones.green.fg : tones.red.fg;
  const msg = same ? 'This is your current username' : !valid ? '3–15 lowercase letters, numbers or _' : taken ? 'Taken. Try another.' : '✓ Available';
  const base = (draft || u).replace(/_+$/, '').slice(0, 11);
  const suggestions = [base + '_', base + '1', 'its' + base, base + '_pay']
    .filter((x) => isValidUsername(x) && x !== u && x !== draft && !TAKEN_USERNAMES.includes(x))
    .slice(0, 3);

  const save = () => {
    if (!ok) return;
    haptic('success');
    setUsername(draft);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 }}>
        <Avatar index={avatar} size={52} />
        <View style={{ gap: 2 }}>
          <Txt size={22} w={800} ls={-0.025}>
            Change username
          </Txt>
          <Txt size={14} color={colors.sub}>
            How people find and pay you
          </Txt>
        </View>
      </View>
      <View style={[styles.nameField, { borderColor: ring }]}>
        <Txt size={22} w={700} color={colors.faint}>
          @
        </Txt>
        <TextInput
          value={draft}
          onChangeText={(t) => setDraft(t.toLowerCase().replace(/\s/g, ''))}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          maxLength={20}
          onSubmitEditing={save}
          style={styles.nameInput}
        />
        <View style={[styles.nameIcon, { backgroundColor: same ? 'transparent' : ok ? tones.green.fg : tones.red.fg }]}>
          <Txt size={14} w={800} color={colors.white}>
            {same ? '' : ok ? '✓' : '✕'}
          </Txt>
        </View>
      </View>
      <Txt size={14} w={600} color={same ? colors.sub : ok ? tones.green.fg : tones.red.fg} style={{ marginTop: -8, paddingHorizontal: 4, minHeight: 18 }}>
        {msg}
      </Txt>
      {suggestions.length > 0 && (
        <View style={{ gap: 10 }}>
          <Label style={{ paddingHorizontal: 4 }}>SUGGESTIONS</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((x) => (
              <Tap key={x} onPress={() => setDraft(x)} style={styles.suggestion}>
                <Txt size={14} w={700} color={colors.accFg}>
                  @{x}
                </Txt>
              </Tap>
            ))}
          </View>
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10, paddingTop: 4 }}>
        <Button label="Cancel" variant="soft" onPress={onClose} style={{ flex: 1 }} />
        <Button label="Save" disabled={!ok} onPress={save} style={{ flex: 1.4 }} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  top: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  edit: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  nameField: { height: 62, borderRadius: 18, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 10, gap: 2, borderWidth: 2 },
  nameInput: { flex: 1, minWidth: 0, fontSize: 22, fontFamily: font[700], letterSpacing: -0.22, color: colors.ink, paddingVertical: 0 },
  nameIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  suggestion: { height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: colors.accBg, justifyContent: 'center' },
});
