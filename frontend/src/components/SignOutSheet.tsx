import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, tones } from '@/theme';
import { Avatar } from './Avatar';
import { Button } from './Button';
import { GoogleG } from './layout';
import { Sheet } from './Sheet';
import { Txt } from './Txt';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  avatar: number;
  name: string;
  detail: string;
  body: string;
};

/** "Sign out?" sheet shared by both roles. */
export function SignOutSheet({ visible, onClose, onConfirm, avatar, name, detail, body }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} center dim={0.38}>
      <View style={{ marginTop: 8 }}>
        <View style={{ width: 87, height: 87, borderRadius: 44, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' }}>
            <Avatar index={avatar} size={76} />
          </View>
        </View>
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: tones.red.bg,
            borderWidth: 3,
            borderColor: colors.white,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={tones.red.fg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 12H4" />
            <Path d="M8 8l-4 4 4 4" />
            <Path d="M13 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5" />
          </Svg>
        </View>
      </View>
      <View style={{ gap: 6, paddingHorizontal: 6 }}>
        <Txt size={24} w={800} ls={-0.025} align="center">
          Sign out?
        </Txt>
        <Txt size={16} lh={1.5} color={colors.sub} align="center">
          {body}
        </Txt>
      </View>
      <View style={{ alignSelf: 'stretch', borderRadius: 18, backgroundColor: colors.bg, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar index={avatar} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
          <Txt size={15} w={700} numberOfLines={1}>
            {name}
          </Txt>
          <Txt size={13} color={colors.sub} numberOfLines={1}>
            {detail}
          </Txt>
        </View>
        <GoogleG size={18} />
      </View>
      <View style={{ alignSelf: 'stretch', gap: 8 }}>
        <Button label="Sign out" variant="danger" onPress={onConfirm} />
        <Button label="Stay signed in" variant="soft" height={54} onPress={onClose} />
      </View>
    </Sheet>
  );
}
