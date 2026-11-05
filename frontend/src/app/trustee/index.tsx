import { Redirect, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, Chip, FadeInRow, ReviewRow, RingedAvatar, ScrollScreen, Screen, Tap, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { buildPeople, reqIcon, reqTitle } from '@/data/people';
import { trusteeName, useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';
import { colors } from '@/theme';

export default function TrusteeIndex() {
  const status = useStore((s) => s.trusteeStatus);
  const hasName = useStore((s) => !!s.tDisplayName);
  if (status === 'pending') return <Redirect href="/trustee/invite" />;
  if (status === 'active' && !hasName) return <Redirect href="/trustee/profile" />;
  if (status === 'none') return <NoInvite />;
  return <Home />;
}

function Home() {
  const now = useNow();
  const s = useStore();
  const tn = trusteeName(s);
  const people = buildPeople(s, now);
  const review = people[0].review;
  const need = review.length;

  return (
    <ScrollScreen>
      <View style={styles.header}>
        <View style={{ gap: 1 }}>
          <Txt size={13} w={600} color={colors.sub}>
            Trustee
          </Txt>
          <Txt size={18} w={800} ls={-0.01}>
            {tn}
          </Txt>
        </View>
        <Tap onPress={() => router.push('/trustee/settings')} accessibilityLabel="Settings" pressedScale={0.9}>
          <RingedAvatar index={s.trusteeAvatar} size={44} />
        </Tap>
      </View>

      <View style={{ gap: 4 }}>
        <Txt size={30} w={800} ls={-0.03} lh={1.1}>
          People you look after
        </Txt>
        <Txt size={15} color={colors.sub}>
          {people.length} people · {need ? `${need} need${need > 1 ? '' : 's'} you` : 'all good'}
        </Txt>
      </View>

      {need > 0 && (
        <View style={{ gap: 10 }}>
          <Txt size={20} w={800} ls={-0.02}>
            Needs you
          </Txt>
          {review.map((r) => (
            <ReviewRow key={r.id} icon={reqIcon(r)} title={`@${s.username} · ${reqTitle(r)}`} onPress={() => router.push(`/trustee/request/${r.id}`)} />
          ))}
        </View>
      )}

      <View>
        {people.map((p) => {
          const n = p.review.length;
          return (
            <FadeInRow key={p.id}>
              <Tap feedback="opacity" onPress={() => router.push(`/trustee/person/${p.id}`)} style={styles.person}>
                <Avatar index={p.avatar} size={48} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt size={17} w={700}>
                    @{p.username}
                  </Txt>
                  <Txt size={13} color={colors.sub} numberOfLines={1}>
                    {p.feed[0]?.title ?? 'No activity yet'}
                  </Txt>
                </View>
                <Chip label={n ? `${n} needs you` : 'All good'} tone={n ? 'acc' : 'green'} />
              </Tap>
            </FadeInRow>
          );
        })}
      </View>
    </ScrollScreen>
  );
}

function NoInvite() {
  const { signOut } = useAuth();
  return (
    <Screen style={{ justifyContent: 'center', gap: 16 }}>
      <Txt size={28} w={800} ls={-0.03}>
        No invites yet
      </Txt>
      <Txt size={17} lh={1.5} color={colors.sub}>
        Finish signing up on the wallet account first.
      </Txt>
      <Button label="Sign out" variant="soft" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
});
