import React, { useState } from 'react';
import { StyleSheet, Pressable, Text, View, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';

import { HelloWave } from '@/components/HelloWave';
import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

import { useAuth } from '../context/auth-context';

export default function HomeScreen() {
  const [modalVisible, setModalVisible] = useState(false);
  const [code, setCode] = useState('');
  const { isAuthed, loginWithPin, logout } = useAuth();

  const handleValidate = () => {
    const ok = loginWithPin(code.trim());
    if (ok) {
      setModalVisible(false);
      setCode('');
      Alert.alert('Welcome', 'authetification grated');
    } else {
      Alert.alert('wrooooonnnng', 'Try again.');
    }
  };

  return (
    <View style={styles.screen}>
      <ParallaxScrollView
        headerBackgroundColor={{ light: '#A1CEDC', dark: '#1D3D47' }}
        headerImage={
          <Image
            source={require('@/assets/images/partial-react-logo.png')}
            style={styles.reactLogo}
          />
        }
      >
        <ThemedView style={styles.titleContainer}>
          <ThemedText type="title">Welcome!</ThemedText>
          <HelloWave />
        </ThemedView>

        {!isAuthed ? (
          <>
            <Pressable style={styles.button} onPress={() => setModalVisible(true)}>
              <Text style={styles.buttonText}>Identify Yourself</Text>
            </Pressable>

            <ThemedView style={styles.stepContainer}>
              <ThemedText type="subtitle">It is mandatory</ThemedText>
              <ThemedText>
                <ThemedText type="defaultSemiBold">
                  Without authentication, you will not be able to access the rest of the application.
                </ThemedText>
              </ThemedText>
            </ThemedView>
          </>
        ) : (
          <>
            <ThemedView style={styles.stepContainer}>
              <ThemedText type="subtitle">You are authenticated</ThemedText>
              <ThemedText>Tabs Logs, Data and Admin are now accessible.</ThemedText>
            </ThemedView>
            <Pressable style={[styles.button, { backgroundColor: '#E53935' }]} onPress={logout}>
              <Text style={styles.buttonText}>Log out</Text>
            </Pressable>
          </>
        )}
      </ParallaxScrollView>

      {modalVisible && (
        <View style={styles.overlay} pointerEvents="auto">
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter your code</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              secureTextEntry
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={handleValidate} style={styles.modalButton}>
                <Text style={styles.modalButtonText}>Validate</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={[styles.modalButton, styles.cancelButton]}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, position: 'relative' },

  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 178,
    width: 290,
    bottom: 0,
    left: 0,
    position: 'absolute',
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    alignSelf: 'center',
    marginVertical: 16,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: '86%',
    maxWidth: 420,
    borderRadius: 12,
    padding: 24,
    backgroundColor: '#fff',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  modalTitle: {
    fontSize: 20,
    marginBottom: 16,
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  modalButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: '#888',
  },
  modalButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});
