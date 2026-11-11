import { NativeText as Text } from "./native-text"
import type { ReactNode } from "react"
import { Modal, Pressable, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "./icon"
import { useNativeGuard } from "./ui"

/** La feuille native des menus (publication, protection) ; sortie de `post-actions.tsx` pour être partagée sans cycle d'import. */
export function PostSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard()
  return <Modal visible={open && guard.canAct} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12, borderBottomColor: tokens.border, borderBottomWidth: 1 }}>
        <Text variant="display" accessibilityRole="header" style={{ flex: 1, color: tokens.foreground, fontSize: 19, fontWeight: "700" }}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.close")} onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><NativeIcon name="close" /></Pressable>
      </View>
      {children}
    </SafeAreaView>
  </Modal>
}
