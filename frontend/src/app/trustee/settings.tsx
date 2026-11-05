import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Avatar, AvatarPicker, BackButton, Button, Card, KV, Label, ScrollScreen, Sheet, SignOutSheet, Tap, Txt } from '@/components';
import { trusteeName, useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';
import { haptic } from '@/lib/haptics';
import { colors, font, tones } from '@/theme';

const PEOPLE_COUNT = 3;

export default function TrusteeSettings() {
  const { session, signOut } = useAuth();
  const s = useStore();
  const tn = trusteeName(s);
  const [nameOpen, setNameOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

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
          <Avatar index={s.trusteeAvatar} size={92} />
        </View>
        <View style={{ gap: 12 }}>
          <Label>AVATAR</Label>
          <AvatarPicker value={s.trusteeAvatar} onChange={s.setTrusteeAvatar} />
        </View>
      </View>

      <Card>
        <View style={[styles.row, styles.divider, { paddingVertical: 10 }]}>
          <Txt color={colors.sub}>Name</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt w={600}>{tn}</Txt>
            <Tap onPress={() => setNameOpen(true)} accessibilityLabel="Edit name" style={styles.edit}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={colors.accFg} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M4 20h4L19 9l-4-4L4 16v4z" />
                <Path d="M13.5 6.5l4 4" />
              </Svg>
            </Tap>
          </View>
        </View>
        <KV k="Signed in with" v={<Txt w={600}>{session?.method ?? 'Google'}</Txt>} />
        <KV
          k="Contact"
          last
          v={
            <Txt w={600} numberOfLines={1} style={{ flexShrink: 1 }}>
              {s.trusteeContact}
            </Txt>
          }
        />
      </Card>

      <View style={{ gap: 8 }}>
        <Label style={{ paddingHorizontal: 4 }}>TRUSTEE FOR</Label>
        <Card>
          <KV k="People you look after" v={<Txt w={600}>{PEOPLE_COUNT}</Txt>} last />
        </Card>
      </View>

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

      <NameSheet visible={nameOpen} onClose={() => setNameOpen(false)} />
      <SignOutSheet
        visible={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => {
          haptic('heavy');
          setSignOutOpen(false);
          void signOut();
        }}
        avatar={s.trusteeAvatar}
        name={tn}
        detail={s.trusteeContact}
        body={`You won’t get alerts for ${PEOPLE_COUNT} people until you sign back in.`}
      />
    </ScrollScreen>
  );
}

function NameSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStore();
  const tn = trusteeName(s);
  const [draft, setDraft] = useState('');
  const [lastOpen, setLastOpen] = useState(false);
  if (visible !== lastOpen) {
    setLastOpen(visible);
    if (visible) setDraft(tn === 'Your trustee' ? '' : tn);
  }
  const v = draft.trim();
  const ok = !!v && v !== tn;
  const msg = !v ? 'Enter a name' : v === tn ? 'This is your current name' : 'Looks good';

  const save = () => {
    if (!ok) return;
    haptic('success');
    s.setTrusteeName(v);
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingTop: 4 }}>
        <Avatar index={s.trusteeAvatar} size={52} />
        <View style={{ gap: 2 }}>
          <Txt size={22} w={800} ls={-0.025}>
            Change your name
          </Txt>
          <Txt size={14} color={colors.sub}>
            People you look after see this
          </Txt>
        </View>
      </View>
      <View style={[styles.nameField, { borderColor: ok ? tones.green.fg : 'transparent' }]}>
        <TextInput value={draft} onChangeText={setDraft} autoFocus autoCorrect={false} spellCheck={false} onSubmitEditing={save} style={styles.nameInput} />
      </View>
      <Txt size={14} w={600} color={ok ? tones.green.fg : colors.sub} style={{ marginTop: -8, paddingHorizontal: 4, minHeight: 18 }}>
        {msg}
      </Txt>
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
  nameField: { height: 62, borderRadius: 18, backgroundColor: colors.bg, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, borderWidth: 2 },
  nameInput: { flex: 1, minWidth: 0, fontSize: 22, fontFamily: font[700], letterSpacing: -0.22, color: colors.ink, paddingVertical: 0 },
});
