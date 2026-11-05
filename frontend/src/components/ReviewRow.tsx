import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { FadeInRow } from './motion';
import { Tap } from './Tap';
import { Txt } from './Txt';

/** Orange "Needs you" row, shared with the person screen. */
export function ReviewRow({ icon, title, onPress }: { icon: string; title: string; onPress: () => void }) {
  return (
    <FadeInRow>
      <Tap onPress={onPress} pressedScale={0.98} style={styles.review} accessibilityLabel={`${title}. Waiting for your answer`}>
        <View style={styles.reviewIcon}>
          <Txt size={18} w={800} color={colors.accFg}>
            {icon}
          </Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt size={16} w={700}>
            {title}
          </Txt>
          <Txt size={13} color={colors.brown}>
            Waiting for your answer
          </Txt>
        </View>
        <Txt size={20} color={colors.brown}>
          ›
        </Txt>
      </Tap>
    </FadeInRow>
  );
}

const styles = StyleSheet.create({
  review: { borderRadius: 18, backgroundColor: colors.accBg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  reviewIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
});
