import { Link, Stack } from 'expo-router';
import { StyleSheet, Pressable, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';

export default function NotFoundScreen() {
  const player = useVideoPlayer(require('@/assets/video/mr-fresh-cat.mp4'), (player) => {
    player.loop = true;
    player.play();
  });

  return (
    <>
      <Stack.Screen options={{ title: 'WHAT DOING FAM ????' }} />
      <ThemedView style={styles.ContainerTitle}>
        <ThemedText type="title">Nothing Here.</ThemedText>

      <ThemedView style={styles.ContainerMain}></ThemedView>
        <VideoView
          player={player}
          style={styles.video}
        />

        <Link href="/" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Go to Home page</Text>
          </Pressable>
        </Link>

      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  ContainerTitle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
    ContainerMain: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
    alignSelf: 'center',
    marginVertical: 25,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  video: {
    width: '80%',
    aspectRatio: 1.11, 
    alignSelf: 'center',
  },
});
