import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useStore } from '@/data/store';
import { DAY, dur } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { Button } from './Button';
import { Sheet } from './Sheet';
import { Tap } from './Tap';
import { Label, Txt } from './Txt';

/**
 * The prototype's demo controls: jump the clock forward (to see new people unlock after 24h)
 * and start over. Only for the mocked build; remove once real data is wired in.
 */
export function DemoTools() {
  const offset = useStore((s) => s.offset);
  const skip = useStore((s) => s.skip);
  const reset = useStore((s) => s.resetDemo);
  const [confirm, setConfirm] = useState(false);

  return (
    <View style={{ gap: 8 }}>
      <Label style={{ paddingHorizontal: 4 }}>DEMO</Label>
      <View style={styles.card}>
        <Tap
          feedback="opacity"
          onPress={() => {
            haptic('medium');
            skip(DAY);
          }}
          style={[styles.row, styles.divider]}>
          <View style={{ gap: 2 }}>
            <Txt w={600}>Skip 24 hours</Txt>
            <Txt size={13} color={colors.sub}>
              {offset ? `Clock is +${dur(offset)} ahead` : 'See new people unlock'}
            </Txt>
          </View>
          <Txt size={20} color={colors.chevron}>
            ›
          </Txt>
        </Tap>
        <Tap feedback="opacity" onPress={() => setConfirm(true)} style={styles.row}>
          <View style={{ gap: 2 }}>
            <Txt w={600}>Restart demo</Txt>
            <Txt size={13} color={colors.sub}>
              Clears both accounts and all payments
            </Txt>
          </View>
          <Txt size={20} color={colors.chevron}>
            ›
          </Txt>
        </Tap>
      </View>
      <Sheet visible={confirm} onClose={() => setConfirm(false)} gap={16} dim={0.32}>
        <View style={{ gap: 8, paddingTop: 6 }}>
          <Txt size={24} w={800} ls={-0.025}>
            Restart the demo?
          </Txt>
          <Txt size={16} lh={1.5} color={colors.sub}>
            This signs you out and clears the wallet, the trustee, and every payment and request.
          </Txt>
        </View>
        <View style={{ gap: 8 }}>
          <Button
            label="Restart"
            variant="danger"
            onPress={() => {
              haptic('heavy');
              setConfirm(false);
              reset();
            }}
          />
          <Button label="Cancel" variant="soft" height={52} size={16} onPress={() => setConfirm(false)} />
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, backgroundColor: colors.white, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
