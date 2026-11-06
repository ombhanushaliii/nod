import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useNow } from '@/data/clock';
import { useTrusteeReportList } from '@/hooks/api';
import { ago, short } from '@/lib/format';
import { colors } from '@/theme';

import { Card, Chip, NavRow, Screen } from './layout';
import { Txt } from './Txt';

/**
 * Both roles: addresses Nod trustees reported with "Deny & report", and how
 * many different trustees reported each. At blockAt, payments to it are
 * blocked for everyone; below that, they need the payer's trustee.
 */
export function ReportedByTrustees() {
  const now = useNow();
  const { list, blockAt, loading, error, refresh } = useTrusteeReportList();

  return (
    <Screen padH={20}>
      <NavRow onBack={() => router.back()} backLabel="Settings" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 18, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}>
        <View style={{ gap: 8 }}>
          <Txt size={28} w={800} ls={-0.03} lh={1.12}>
            Reported by trustees
          </Txt>
          <Txt size={16} lh={1.5} color={colors.sub}>
            Addresses Nod trustees stopped a payment to and reported as a scam. Paying one needs your trustee&apos;s OK.
            At {blockAt} trustees, Nod blocks it for everyone.
          </Txt>
        </View>

        {error && (
          <Txt size={15} color={colors.accFg} accessibilityRole="alert">
            {error}
          </Txt>
        )}

        {!error && !loading && list.length === 0 && (
          <Txt size={15} color={colors.sub}>
            No trustee has reported an address yet.
          </Txt>
        )}

        {list.length > 0 && (
          <Card>
            {list.map((r, i) => {
              const blocked = r.trustees >= blockAt;
              return (
                <View key={r.address} style={[styles.row, i < list.length - 1 && styles.divider]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={15} w={700} tabular>
                      {short(r.address)}
                    </Txt>
                    <Txt size={13} color={colors.sub}>
                      Reported by {r.trustees} trustee{r.trustees === 1 ? '' : 's'} · {ago(r.lastReportedAt, now)}
                    </Txt>
                  </View>
                  <Chip label={blocked ? 'Blocked' : 'Needs OK'} tone={blocked ? 'red' : 'amber'} />
                </View>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
});
