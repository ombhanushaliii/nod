import { useEffect, useRef, useState } from 'react';
import { Keyboard, ScrollView, type ScrollViewInstance, View } from 'react-native';

import { Avatar, AvatarPicker, Button, Label, Screen, TextField, Txt } from '@/components';
import { ownTrusteeName, useStore } from '@/data/store';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { isDemo } from '@/wallet/config';

/** Trustee sets a name and avatar so the user recognises them. */
export default function TrusteeProfile() {
  // Who they look after: in the demo, the wallet user on this device; live, the
  // person whose invite they just accepted (handle from the backend, when known).
  const who = useStore((s) => (isDemo ? s.username : (s.people[0]?.username ?? null)));
  const avatar = useStore((s) => s.trusteeAvatar);
  const setAvatar = useStore((s) => s.setTrusteeAvatar);
  const setProfile = useStore((s) => s.setTrusteeProfile);
  // Your own name as a trustee (live: never your wallet's trustee).
  const tn = useStore(ownTrusteeName);
  const [name, setName] = useState(tn === 'Your trustee' || tn === 'You' ? '' : tn);
  const ok = !!name.trim();
  // The avatar grid leaves no room for the name field once the keyboard is up,
  // so the content scrolls, and opening the keyboard scrolls the field into view.
  const scroll = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scroll.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  const done = () => {
    if (!ok) return;
    haptic('success');
    setProfile(name.trim());
  };

  return (
    <Screen keyboard>
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={{ gap: 8, paddingTop: 60, paddingBottom: 26 }}>
          <Txt size={30} w={800} ls={-0.03}>
            Set up your profile
          </Txt>
          <Txt size={17} lh={1.5} color={colors.sub}>
            {who ? `So @${who} knows it’s you.` : 'So the person you look after knows it’s you.'}
          </Txt>
        </View>
        <View style={{ gap: 18, paddingBottom: 20 }}>
          <View style={{ alignSelf: 'center' }}>
            <Avatar index={avatar} size={88} />
          </View>
          <View style={{ gap: 12 }}>
            <Label>CHOOSE AN AVATAR</Label>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </View>
        </View>
        <TextField value={name} onChangeText={setName} placeholder="Your name" autoCapitalize="words" returnKeyType="done" onSubmitEditing={done} />
      </ScrollView>
      {/* Stays just above the keyboard. */}
      <Button label="Continue" disabled={!ok} onPress={done} />
    </Screen>
  );
}
