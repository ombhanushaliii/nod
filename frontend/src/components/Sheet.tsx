import { useEffect, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Backdrop tint; the prototype uses slightly different ones per sheet. */
  dim?: number;
  center?: boolean;
  gap?: number;
};

/** Bottom sheet with the prototype's fadeIn backdrop + sheetUp slide. */
export function Sheet({ visible, onClose, children, dim = 0.34, center, gap = 18 }: Props) {
  const insets = useSafeAreaInsets();
  const [v] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 360, easing: Easing.bezier(0.2, 0.9, 0.3, 1), useNativeDriver: true }).start();
  }, [visible, v]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(37,40,43,${dim})`, opacity: v.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 1, 1] }) }]}>
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 12) + 28, gap, alignItems: center ? 'center' : 'stretch' },
              { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [600, 0] }) }] },
            ]}>
            <View style={styles.handle} />
            {children}
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -10 },
    elevation: 12,
  },
  handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.handle, alignSelf: 'center' },
});
