// Viewfinder kamera untuk scan barcode resi — native (Android) saja.
// expo-camera tidak mendukung barcode scanning di web → komponen ini null di web
// dan pemanggil (pickup.tsx) menampilkan fallback input manual.
import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { Button } from './ui';
import { colors, radius } from '../theme';

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [active, setActive] = useState(true);
  const handledRef = useRef(false);
  const lastDetectedRef = useRef(0);

  // Berhenti memindai setelah satu kode berhasil — mencegah pemicu ganda.
  useEffect(() => {
    if (!active) handledRef.current = true;
  }, [active]);

  const handleDetected = (result: BarcodeScanningResult) => {
    const now = Date.now();
    if (!active || handledRef.current || now - lastDetectedRef.current < 1500) return;
    lastDetectedRef.current = now;
    const code = result.data.trim();
    if (!code) return;
    setActive(false);
    onDetected(code);
  };

  if (Platform.OS !== 'web' && permission && !permission.granted) {
    return (
      <View style={styles.permissionBox}>
        <Text style={styles.permissionTitle}>Izin kamera diperlukan</Text>
        <Text style={styles.permissionSub}>
          ZProject butuh akses kamera untuk memindai barcode resi. Anda bisa memberi izin lalu mencoba lagi, atau
          kembali ke input manual.
        </Text>
        <View style={styles.actions}>
          <Button label="Beri izin kamera" onPress={() => requestPermission()} />
          <Button label="Input manual" variant="secondary" onPress={onClose} />
        </View>
      </View>
    );
  }

  if (Platform.OS === 'web' || !permission?.granted) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          active={active}
          onBarcodeScanned={handleDetected}
          barcodeScannerSettings={{ barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
        />
        <View style={styles.overlay} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>Arahkan kamera ke nomor order / barcode resi</Text>
        </View>
      </View>
      <Button label="Tutup kamera" variant="secondary" size="sm" onPress={onClose} style={styles.closeBtn} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  cameraWrap: { height: 300, borderRadius: radius.md, overflow: 'hidden' },
  overlay: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center', gap: 14,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  frame: {
    width: 220, height: 90,
    borderWidth: 2, borderColor: '#FFFFFF',
    borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  hint: { color: '#fff', fontSize: 12, fontWeight: '700', backgroundColor: 'rgba(15,22,42,.55)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm, overflow: 'hidden' },
  closeBtn: { marginTop: 10, alignSelf: 'center' },
  permissionBox: { alignItems: 'center', paddingVertical: 18, gap: 8 },
  permissionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  permissionSub: { fontSize: 11, color: colors.muted, lineHeight: 16, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 6 },
});
