import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, Chip, FadeInRow, ReviewRow, RingedAvatar, ScrollScreen, Screen, Tap, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { handleFrom } from '@/data/engine';
import { buildPeople, reqIcon, reqTitle } from '@/data/people';
import { trusteeName, trusteeSide, useStore } from '@/data/store';
import { useAuth } from '@/hooks/api';
import { type EmailInvite, useAcceptInvite, useEmailInvites } from '@/hooks/trustee';
import { haptic } from '@/lib/haptics';
import { colors } from '@/theme';
import { isDemo } from '@/wallet/config';

export default function TrusteeIndex() {
  const status = useStore(trusteeSide);
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
  const review = people.flatMap((p) => p.review.map((r) => ({ r, who: p.username })));
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
          {people.length} {people.length === 1 ? 'person' : 'people'} · {need ? `${need} need${need > 1 ? '' : 's'} you` : 'all good'}
        </Txt>
      </View>

      {s.trusteeError && (
        <Txt size={14} lh={1.5} color={colors.accFg} accessibilityRole="alert">
          {s.trusteeError}
        </Txt>
      )}

      {need > 0 && (
        <View style={{ gap: 10 }}>
          <Txt size={20} w={800} ls={-0.02}>
            Needs you
          </Txt>
          {review.map(({ r, who }) => (
            <ReviewRow key={r.id} icon={reqIcon(r)} title={`@${who} · ${reqTitle(r)}`} onPress={() => router.push(`/trustee/request/${r.id}`)} />
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

/**
 * No invite link opened on this phone. Live, invites sent to this account's
 * email show up here too, so the trustee can accept without the email.
 */
function NoInvite() {
  const { signOut, user } = useAuth();
  const { invites, loading, error, reload } = useEmailInvites();
  const accept = useAcceptInvite();
  const [busy, setBusy] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Accepting flips the route guard to profile setup, like the email link does.
  const onAccept = async (invite: EmailInvite) => {
    if (busy) return;
    setBusy(invite.inviteId);
    setAcceptError(null);
    try {
      await accept(invite);
      haptic('success');
    } catch (err) {
      haptic('error');
      setAcceptError(err instanceof Error ? err.message : "Couldn't accept the invite. Try again.");
      void reload();
    } finally {
      setBusy(null);
    }
  };

  if (!isDemo && invites.length > 0) {
    return (
      <Screen style={{ justifyContent: 'center', gap: 16 }}>
        <Txt size={28} w={800} ls={-0.03} lh={1.12}>
          {invites.length === 1 ? "You've been asked to be a trustee" : `${invites.length} people asked you to be their trustee`}
        </Txt>
        <Txt size={17} lh={1.5} color={colors.sub}>
          You&apos;ll check risky payments before they go out. You can&apos;t touch their money.
        </Txt>
        <View style={{ gap: 10 }}>
          {invites.map((invite) => (
            <View key={invite.inviteId} style={styles.invite}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Txt size={17} w={700} numberOfLines={1}>
                  {invite.from ? `@${handleFrom(invite.from)}` : 'Someone'}
                </Txt>
                <Txt size={13} color={colors.sub} numberOfLines={1}>
                  {invite.from ? `${invite.from} · ` : ''}wants you as their trustee
                </Txt>
              </View>
              <Button
                label={busy === invite.inviteId ? 'Setting up…' : 'Accept'}
                height={44}
                size={15}
                disabled={!!busy}
                onPress={() => void onAccept(invite)}
                style={{ paddingHorizontal: 18 }}
              />
            </View>
          ))}
        </View>
        {acceptError && (
          <Txt size={14} lh={1.5} color={colors.accFg} accessibilityRole="alert">
            {acceptError}
          </Txt>
        )}
        <Button label="Sign out" variant="ghost" height={48} size={16} disabled={!!busy} onPress={() => void signOut()} />
      </Screen>
    );
  }

  return (
    <Screen style={{ justifyContent: 'center', gap: 16 }}>
      <Txt size={28} w={800} ls={-0.03}>
        No invites yet
      </Txt>
      <Txt size={17} lh={1.5} color={colors.sub}>
        {isDemo
          ? 'Finish signing up on the wallet account first.'
          : `Invites sent to ${user?.email || 'your email'} show up here. You can also open the invite link from the email on this phone.`}
      </Txt>
      {(error || acceptError) && (
        <Txt size={14} lh={1.5} color={colors.accFg} accessibilityRole="alert">
          {error ?? acceptError}
        </Txt>
      )}
      {!isDemo && (
        <Button label={loading ? 'Checking…' : 'Check again'} disabled={loading} onPress={() => void reload()} />
      )}
      <Button label="Sign out" variant="soft" onPress={() => void signOut()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.white },
});
