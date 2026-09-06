// Pemilih foto bersama: kamera/galeri di native, galeri di web.
// Dipakai alur barcode pengambilan (NewOrderModal, pickup, OrderDetailModal).
// Kompresi ala PickHub: resize lebar maks 1000px + JPEG 0.65
// -> ukuran turun dari ~1MB menjadi ~60-150KB per foto (irit storage & cepat load).
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

type PickAsset = { uri: string; fileName?: string | null; mimeType?: string | null };

async function compressPhoto(a: PickAsset): Promise<PickedPhoto> {
  const fallback = (): PickedPhoto => ({
    uri: a.uri,
    name: a.fileName ?? `foto-${Date.now()}.jpg`,
    type: a.mimeType ?? 'image/jpeg',
  });
  try {
    const manipulate = ImageManipulator.manipulateAsync(
      a.uri,
      [{ resize: { width: 1000 } }],
      { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG },
    );
    // Jaring pengaman web: resize boleh gagal/gantung, batasi 8 detik
    // lalu upload file asli apa adanya (pola yang sama dengan PickHub).
    const res = Platform.OS === 'web'
      ? await Promise.race([
          manipulate,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ])
      : await manipulate;
    if (!res?.uri) return fallback();
    return { uri: res.uri, name: `foto-${Date.now()}.jpg`, type: 'image/jpeg' };
  } catch {
    return fallback();
  }
}

export async function pickPhoto(title = 'Pilih sumber gambar'): Promise<PickedPhoto | null> {
  const pick = (source: 'camera' | 'library') =>
    source === 'camera'
      ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
  let res: ImagePicker.ImagePickerResult;
  if (Platform.OS === 'web') {
    res = await pick('library');
  } else {
    res = await new Promise<ImagePicker.ImagePickerResult>((resolve) => {
      Alert.alert(title, 'Pilih sumber gambar', [
        { text: 'Batal', style: 'cancel' },
        { text: 'Ambil dari Kamera', onPress: () => pick('camera').then(resolve) },
        { text: 'Pilih dari Galeri', onPress: () => pick('library').then(resolve) },
      ]);
    });
  }
  const a = res.assets?.[0];
  if (res.canceled || !a) return null;
  return compressPhoto(a);
}
