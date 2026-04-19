import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const TERMS_TEXT = `Terms of Use
1. Acceptance of Terms
By using MedVise, you agree to these Terms of Use. If you do not agree, please do not use the app.

2. Medical Disclaimer
MedVise is an AI powered informational assistant. It does NOT provide medical diagnoses or replace professional medical advice. Always consult a qualified healthcare provider for medical decisions.

3. Use of Service
- Do not use MedVise in place of emergency services
- In an emergency, call your local emergency number immediately

4. Data & Privacy
Your conversations may be processed to provide AI responses. We do not sell your personal data to third parties.

5. Changes to Terms
We may update these terms at any time. Continued use of the app means you accept the updated terms.`;

const PRIVACY_TEXT = `Privacy Policy
1. Information We Collect
- Account information (name, email) via Clerk authentication
- Chat messages you send to the AI assistant
- Device location (only when finding nearby doctors, with your permission)

2. How We Use Your Information
- To provide AI powered medical information
- To find nearby healthcare providers based on your location
- To improve our services

3. Data Storage
- We do not store your conversations on our servers permanently

4. Third-Party Services
- Clerk (authentication)
- Google Gemini AI (chat processing)
- OpenStreetMap (nearby doctor search)
`;

const FAQ_ITEMS = [
  { q: "What is MedVise?", a: "MedVise is an AI-powered medical assistant that helps you understand symptoms related to heart disease, hypertension, diabetes, and thyroid disorders." },
  { q: "Can MedVise diagnose me?", a: "No. MedVise provides general health information only. It cannot diagnose conditions. Always consult a qualified doctor for medical advice." },
  { q: "How does the doctor recommendation work?", a: "When your symptoms suggest you should see a doctor, MedVise uses your device location to find nearby hospitals and clinics using OpenStreetMap data." },
  { q: "Is my chat history saved?", a: "Chat history is stored in your app session. You can clear it anytime from Settings → Data Controls." },
  { q: "Is MedVise free to use?", a: "Yes, MedVise is currently free for all users." },
  { q: "What should I do in an emergency?", a: "Do NOT use MedVise in emergencies. Call your local emergency number ." },
];

export default function SettingsScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [modalType, setModalType] = useState<"dataControls" | "helpCenter" | "terms" | "privacy" | null>(null);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const email = user?.primaryEmailAddress?.emailAddress || "No email found";

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: async () => {
          try { await signOut(); router.replace("/(auth)/sign-in"); } catch (err) { console.error("Sign out error:", err); }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.section}>
          <View style={[styles.row, styles.rowFirst]}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: "#f0f0f0" }]}><Ionicons name="mail-outline" size={18} color="#444" /></View>
              <View><Text style={styles.rowTitle}>Email</Text><Text style={styles.rowSubtitle} numberOfLines={1}>{email}</Text></View>
            </View>
          </View>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => router.push("/predictions")} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: "#f0f0f0" }]}><Ionicons name="analytics-outline" size={18} color="#444" /></View>
              <View>
                <Text style={styles.rowTitle}>Predictions</Text>
                <Text style={styles.rowSubtitle}>View & label your AI predictions</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setModalType("dataControls")} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: "#f0f0f0" }]}><Ionicons name="shield-outline" size={18} color="#444" /></View>
              <Text style={styles.rowTitle}>Data Controls</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.section}>
          <TouchableOpacity style={[styles.row, styles.rowFirst]} onPress={() => setModalType("helpCenter")} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: "#f0f0f0" }]}><Ionicons name="help-circle-outline" size={18} color="#444" /></View>
              <Text style={styles.rowTitle}>Help Center</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={styles.row} onPress={() => setModalType("terms")} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: "#f0f0f0" }]}><Ionicons name="document-text-outline" size={18} color="#444" /></View>
              <Text style={styles.rowTitle}>Terms of Use</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity style={[styles.row, styles.rowLast]} onPress={() => setModalType("privacy")} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: "#f0f0f0" }]}><Ionicons name="lock-closed-outline" size={18} color="#444" /></View>
              <Text style={styles.rowTitle}>Privacy Policy</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleSignOut} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.versionText}>MedVise v1.0</Text>
      </ScrollView>

      <InfoModal visible={modalType === "dataControls"} onClose={() => setModalType(null)} title="Data safety" icon="shield-checkmark-outline">
        <Text style={modalStyles.bodyText}>Safety starts with understanding how developers collect and share your data. Data privacy and security practices may vary based on your use, region, and age.</Text>
        <View style={modalStyles.safetyList}>
          <SafetyRow icon="share-social-outline" label="No data shared with third parties" />
          <SafetyRow icon="cloud-offline-outline" label="No data collected" />
          <SafetyRow icon="lock-closed-outline" label="Data is encrypted in transit" />
   
        </View>
        <View style={modalStyles.divider} />
   
      </InfoModal>

    
      <InfoModal visible={modalType === "helpCenter"} onClose={() => { setModalType(null); setOpenFaqIndex(null); }} title="Help Center" icon="help-circle-outline">
        {FAQ_ITEMS.map((item, index) => (
          <FAQItem 
            key={index} 
            question={item.q} 
            answer={item.a} 
            isOpen={openFaqIndex === index}
            onPress={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
          />
        ))}
      </InfoModal>

      <InfoModal visible={modalType === "terms"} onClose={() => setModalType(null)} title="Terms of Use" icon="document-text-outline"><Text style={modalStyles.bodyText}>{TERMS_TEXT}</Text></InfoModal>
      <InfoModal visible={modalType === "privacy"} onClose={() => setModalType(null)} title="Privacy Policy" icon="lock-closed-outline"><Text style={modalStyles.bodyText}>{PRIVACY_TEXT}</Text></InfoModal>
    </SafeAreaView>
  );
}

function SafetyRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={modalStyles.safetyRow}>
      <Ionicons name={icon as any} size={20} color="#5f6368" />
      <Text style={modalStyles.safetyLabel}>{label}</Text>
    </View>
  );
}

function InfoModal({ visible, onClose, title, icon, children }: any) {
  const slideAnim = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    if (visible) { Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, friction: 10, tension: 80 }).start(); }
  }, [visible]);

  const handleHide = () => { Animated.timing(slideAnim, { toValue: 600, duration: 220, useNativeDriver: true }).start(onClose); };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleHide}>
      <View style={modalStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleHide} />
        <Animated.View style={[modalStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          <View style={modalStyles.handle} />
          <View style={modalStyles.header}>
            <View style={modalStyles.headerIconWrap}><Ionicons name={icon} size={20} color="#111" /></View>
            <Text style={modalStyles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={handleHide} style={modalStyles.closeBtn}><Ionicons name="close" size={20} color="#666" /></TouchableOpacity>
          </View>
          <View style={modalStyles.headerDivider} />
          <ScrollView style={modalStyles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

function FAQItem({ question, answer, isOpen, onPress }: any) {
  const rotateAnim = useRef(new Animated.Value(isOpen ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, { toValue: isOpen ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [isOpen]);

  return (
    <View style={faqStyles.item}>
      <TouchableOpacity style={faqStyles.question} onPress={onPress} activeOpacity={0.7}>
        <Text style={faqStyles.questionText}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate: rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] }) }] }}>
          <Ionicons name="chevron-forward" size={16} color="#888" />
        </Animated.View>
      </TouchableOpacity>
      {isOpen && <Text style={faqStyles.answerText}>{answer}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { 
    flex: 1, 
    backgroundColor: "#f5f5f5" 
  },

  topBar: { 
    height: 56, 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 12, 
    backgroundColor: "#fff", 
    borderBottomWidth: 0.5, 
    borderBottomColor: "#eee" 
  },

  backBtn: {
    width: 40, 
    alignItems: "flex-start", 
    justifyContent: "center" 
  },

  topBarTitle: { 
    fontSize: 16, 
    fontWeight: "600", 
    color: "#111" 
  },

  scroll: { 
    flex: 1 
  },

  scrollContent: { 
    paddingHorizontal: 16, 
    paddingTop: 24, 
    paddingBottom: 40 
  },

  sectionLabel: { 
    fontSize: 11, 
    fontWeight: "700", 
    color: "#999", 
    letterSpacing: 0.8, 
    marginBottom: 8, 
    marginLeft: 4 
  },

  section: { 
    backgroundColor: "#fff", 
    borderRadius: 16, 
    marginBottom: 24, 
    overflow: "hidden", 
    borderWidth: 0.5, 
    borderColor: "#efefef" 
  },

  row: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between", 
    paddingHorizontal: 16, 
    paddingVertical: 14 
  },

  rowFirst: { 
    borderTopLeftRadius: 16, 
    borderTopRightRadius: 16 
  },

  rowLast: { 
    borderBottomLeftRadius: 16, 
    borderBottomRightRadius: 16 
  },

  rowLeft: { 
    flexDirection: "row",
    alignItems: "center", 
    gap: 12, 
    flex: 1 
  },

  rowTitle: { 
    fontSize: 15, 
    fontWeight: "500", 
    color: "#111" 
  },

  rowSubtitle: { 
    fontSize: 12, 
    color: "#888", 
    marginTop: 1, 
    maxWidth: 220 
  },

  divider: {
    height: 0.5, 
    backgroundColor: "#f0f0f0", 
    marginLeft: 60 
  },

  iconWrap: { 
    width: 34, 
    height: 34, 
    borderRadius: 10, 
    alignItems: "center", 
    justifyContent: "center" 
  },

  logoutBtn: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "center", 
    gap: 8, 
    backgroundColor: "#111", 
    borderRadius: 16, 
    paddingVertical: 16, 
    marginBottom: 16 
  },

  logoutText: { 
    fontSize: 15, 
    fontWeight: "700", 
    color: "#fff" 
  },

  versionText: { 
    textAlign: "center", 
    fontSize: 12, 
    color: "#bbb", 
    marginBottom: 8 
  },
});

const modalStyles = StyleSheet.create({
  overlay: { 
    flex: 1, 
    backgroundColor: "rgba(0,0,0,0.4)", 
    justifyContent: "flex-end" 
  },

  sheet: { 
    backgroundColor: "#fff", 
    borderTopLeftRadius: 28, 
    borderTopRightRadius: 28, 
    maxHeight: "85%", 
    paddingTop: 12 
  },

  handle: { 
    width: 36, 
    height: 4, 
    backgroundColor: "#e0e0e0", 
    borderRadius: 2, 
    alignSelf: "center", 
    marginBottom: 12 
  },

  header: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingHorizontal: 20, 
    paddingBottom: 14, 
    gap: 10 
  },

  headerIconWrap: { 
    width: 36, 
    height: 36, 
    borderRadius: 10, 
    backgroundColor: "#f0f0f0", 
    alignItems: "center", 
    justifyContent: "center" 
  },

  headerTitle: { 
    fontSize: 17, 
    fontWeight: "700", 
    color: "#111", 
    flex: 1 
  },

  closeBtn: { 
    width: 32, 
    height: 32, 
    borderRadius: 16, 
    backgroundColor: "#f5f5f5", 
    alignItems: "center", 
    justifyContent: "center" 
  },

  headerDivider: { 
    height: 0.5, 
    backgroundColor: "#f0f0f0", 
    marginBottom: 16 
  },

  content: { 
    paddingHorizontal: 20, 
    paddingBottom: 40 
  },

  bodyText: { 
    fontSize: 14, 
    color: "#5f6368", 
    lineHeight: 20, 
    marginBottom: 20 
  },

  safetyList: { 
    gap: 16, 
    marginBottom: 20 
  },

  safetyRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 16 
  },

  safetyLabel: { 
    fontSize: 14, 
    color: "#3c4043" 
  },

  actionRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    paddingVertical: 16 
  },

  actionLeft: { 
    flexDirection: "row", 
    alignItems: "center", 
    gap: 12, 
    flex: 1 
  },

  actionTitle: { 
    fontSize: 15, 
    fontWeight: "600" 
  },

  divider: { 
    height: 0.5, 
    backgroundColor: "#f0f0f0" 
  },
});

const faqStyles = StyleSheet.create({
  item: { 
    borderBottomWidth: 0.5, 
    borderBottomColor: "#f0f0f0", 
    paddingVertical: 4 
  },

  question: { 
    flexDirection: "row", 
    justifyContent: "space-between", 
    alignItems: "center", 
    paddingVertical: 10 
  },

  questionText: { 
    fontSize: 14, 
    fontWeight: "600", 
    color: "#111", 
    flex: 1, 
    marginRight: 8 
  },

  answerText: { 
    fontSize: 13, 
    color: "#555", 
    lineHeight: 20, 
    paddingBottom: 10 
  },
});
