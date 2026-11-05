import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar, BackButton, FadeInRow, ReviewRow, ScrollScreen, Tap, Txt } from '@/components';
import { useNow } from '@/data/clock';
import { buildPeople, reqIcon, reqTitle } from '@/data/people';
import { useStore } from '@/data/store';
import type { RulesMode } from '@/data/types';
import { m0 } from '@/lib/format';
import { colors, tones } from '@/theme';

const LIMITS = [25, 50, 100, 250, 500];
const DAILY = [50, 100, 200, 500, 1000];
const fmt = (v: number) => (v >= 1000 ? `$${v / 1000}k` : `$${v}`);

/** One person the trustee looks after: their pending requests, the rules, and activity. */
export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow();
  const s = useStore();
  const people = buildPeople(s, now);
  const p = people.find((x) => x.id === id) ?? people[0];
  const R = p.rules;
  const set = (patch: Partial<typeof R>) => s.setRulesFor(p.id, patch);
  const li = Math.max(0, LIMITS.indexOf(R.limit));
  const di = Math.max(0, DAILY.indexOf(R.daily));

  return (
    <ScrollScreen
      top={
        <View style={styles.top}>
          <BackButton onPress={() => router.back()} label="People" />
        </View>
      }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar index={p.avatar} size={60} />
        <View style={{ gap: 2 }}>
          <Txt size={26} w={800} ls={-0.03}>
            @{p.username}
          </Txt>
          <Txt size={14} color={colors.sub}>
            {p.since}
          </Txt>
        </View>
      </View>

      {p.review.length > 0 && (
        <View style={{ gap: 10 }}>
          <Txt size={20} w={800} ls={-0.02}>
            Needs you
          </Txt>
          {p.review.map((r) => (
            <ReviewRow key={r.id} icon={reqIcon(r)} title={reqTitle(r)} onPress={() => router.push(`/trustee/request/${r.id}`)} />
          ))}
        </View>
      )}

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Txt size={20} w={800} ls={-0.02}>
            Rules you set
          </Txt>
          <Txt size={12} w={600} color={colors.sub}>
            Saves instantly
          </Txt>
        </View>
        <View style={styles.card}>
          <View style={[styles.rule, styles.divider]}>
            <RuleIcon glyph="$" />
            <RuleText title="Ask me above" help="Payments bigger than this need your OK" />
            <Stepper
              value={fmt(R.limit)}
              canDec={li > 0}
              canInc={li < LIMITS.length - 1}
              onDec={() => set({ limit: LIMITS[li - 1] })}
              onInc={() => set({ limit: LIMITS[li + 1] })}
              label="Ask me above"
            />
          </View>
          <View style={[{ gap: 10, paddingVertical: 14 }, styles.divider]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <RuleIcon glyph="↻" />
              <RuleText
                title="How often"
                help={R.mode === 'every_time' ? `You check every payment above ${m0(R.limit)}.` : `You check the first payment above ${m0(R.limit)} to each person.`}
              />
            </View>
            <View style={styles.segment}>
              {(
                [
                  ['first_per_payee', 'First time per person'],
                  ['every_time', 'Every time'],
                ] as [RulesMode, string][]
              ).map(([m, label]) => {
                const on = R.mode === m;
                return (
                  <Tap key={m} onPress={() => set({ mode: m })} accessibilityState={{ selected: on }} style={[styles.segBtn, on && styles.segOn]}>
                    <Txt size={13} w={700}>
                      {label}
                    </Txt>
                  </Tap>
                );
              })}
            </View>
          </View>
          <View style={styles.rule}>
            <RuleIcon glyph="◷" />
            <RuleText title="Daily max" help="Total per day. Going over needs your OK." />
            <Stepper
              value={fmt(R.daily)}
              canDec={di > 0}
              canInc={di < DAILY.length - 1}
              onDec={() => set({ daily: DAILY[di - 1] })}
              onInc={() => set({ daily: DAILY[di + 1] })}
              label="Daily max"
            />
          </View>
        </View>
      </View>

      <View style={{ gap: 4 }}>
        <Txt size={20} w={800} ls={-0.02} style={{ paddingBottom: 6 }}>
          Activity
        </Txt>
        {p.feed.length === 0 && (
          <Txt size={15} lh={1.5} color={colors.sub}>
            Nothing yet.
          </Txt>
        )}
        {p.feed.map((f) => (
          <FadeInRow key={f.id} style={styles.feed}>
            <View style={[styles.feedIcon, { backgroundColor: tones[f.tone].bg }]}>
              <Txt size={17} w={800} color={f.tone === 'plain' ? colors.ink : tones[f.tone].fg}>
                {f.icon}
              </Txt>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
              <Txt size={15} w={700} lh={1.3}>
                {f.title}
              </Txt>
              <Txt size={13} color={colors.sub}>
                {f.sub}
              </Txt>
            </View>
            <Txt size={12} color={colors.sub}>
              {f.time}
            </Txt>
          </FadeInRow>
        ))}
      </View>
    </ScrollScreen>
  );
}

function RuleIcon({ glyph }: { glyph: string }) {
  return (
    <View style={styles.ruleIcon}>
      <Txt size={16} w={800} color={colors.avatarFg}>
        {glyph}
      </Txt>
    </View>
  );
}

function RuleText({ title, help }: { title: string; help: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Txt size={15} w={700}>
        {title}
      </Txt>
      <Txt size={12} lh={1.35} color={colors.sub}>
        {help}
      </Txt>
    </View>
  );
}

function Stepper({ value, canDec, canInc, onDec, onInc, label }: { value: string; canDec: boolean; canInc: boolean; onDec: () => void; onInc: () => void; label: string }) {
  return (
    <View style={styles.stepper}>
      <Tap onPress={onDec} disabled={!canDec} accessibilityLabel={`${label}: less`} style={styles.stepBtn}>
        <Txt size={17} w={700}>
          −
        </Txt>
      </Tap>
      <Txt size={15} w={800} tabular align="center" style={{ minWidth: 54 }}>
        {value}
      </Txt>
      <Tap onPress={onInc} disabled={!canInc} accessibilityLabel={`${label}: more`} style={styles.stepBtn}>
        <Txt size={17} w={700}>
          +
        </Txt>
      </Tap>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { height: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20 },
  card: { borderRadius: 20, backgroundColor: colors.white, paddingHorizontal: 14 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  ruleIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: colors.accSoft, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.bg, borderRadius: 999, padding: 3 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segment: { flexDirection: 'row', gap: 4, padding: 3, borderRadius: 12, backgroundColor: colors.bg },
  segBtn: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.white, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  feed: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  feedIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
