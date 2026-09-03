// Pemilih foto bersama: kamera/galeri di native, galeri di web.
// Dipakai alur barcode pengambilan (NewOrderModal, pickup, OrderDetailModal).
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export interface PickedPhoto {
  uri: string;
  name: string;
  type: string;
}

export async function pickPhoto(title = 'Pilih sumber gambar'): Promise<PickedPhoto | null> {
  const pick = (source: 'camera' | 'library') =>
    source === 'camera'
      ? ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
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
  const ext = a.mimeType === 'image/png' ? 'png' : a.mimeType === 'image/webp' ? 'webp' : 'jpg';
  return { uri: a.uri, name: a.fileName ?? `foto-${Date.now()}.${ext}`, type: a.mimeType ?? 'image/jpeg' };
}
