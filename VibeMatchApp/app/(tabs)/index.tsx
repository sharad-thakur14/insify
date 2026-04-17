import React, { useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Image, ImageBackground, ActivityIndicator, Alert } from 'react-native';
import axios from 'axios';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

const API_BASE_URL = 'http://127.0.0.1:8000';

export default function App() {
  const insets = useSafeAreaInsets();
  const [currentStep, setCurrentStep] = useState<'landing' | 'otp' | 'matches'>('landing');
  const [loading, setLoading] = useState(false);

  // Form Data
  const [name, setName] = useState('Sharad Thakur');
  const [phone, setPhone] = useState('09596572714');
  const [email, setEmail] = useState('thakursharad1224@gmail.com');
  const [otp, setOtp] = useState('');

  const handleRequestOtp = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE_URL}/request-otp`, { name, email, phone });
      setCurrentStep('otp'); // This moves you to the OTP screen
    } catch (e) {
      Alert.alert("Notice", "OTP sent! Check your terminal or phone.");
      setCurrentStep('otp');
    } finally {
      setLoading(false);
    }
  };

 const handleVerifyOtp = async () => {
  setLoading(true);
  try {
    const res = await axios.post(`${API_BASE_URL}/verify-otp`, { 
      name, 
      email, 
      otp,
      phone 
    });
    
    if (res.data.status === 'success') {
      // 🚀 DYNAMIC FIX: Pass the 'name' state as a parameter to the Explore screen
      // This tells the app exactly who is logged in (e.g., Ronit or Priya)
      router.push({
          pathname: '/(tabs)/explore', 
          params: { user: name } 
      });
    }
  } catch (e: any) {
    console.error("Verification failed:", e);
    Alert.alert("Error", "Invalid OTP or connection issue.");
  } finally {
    setLoading(false);
  }
};
  // --- STEP 1: LANDING ---
  if (currentStep === 'landing') {
    return (
      <View style={styles.container}>
        <ImageBackground source={require('../../assets/images/wavy_bg.png')} style={StyleSheet.absoluteFillObject} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}>
          <Image source={require('../../assets/images/punk_hero.png')} style={styles.heroImg} />
          <View style={styles.brandBox}><Text style={styles.brandText}>VIBEMATCH</Text></View>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="NAME" />
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="PHONE" />
          <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="EMAIL" />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestOtp}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>GET OTP →</Text>}
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // --- STEP 2: OTP VERIFICATION (This fixes the black screen!) ---
  if (currentStep === 'otp') {
    return (
      <View style={styles.container}>
        <ImageBackground source={require('../../assets/images/wavy_bg.png')} style={StyleSheet.absoluteFillObject} />
        <View style={[styles.scrollContent, { paddingTop: insets.top + 50 }]}>
          <View style={styles.brandBox}><Text style={styles.brandText}>VERIFY VIBE</Text></View>
          <Text style={styles.instructions}>Enter the 4-digit code sent to your phone</Text>
          <TextInput 
            style={[styles.input, { textAlign: 'center', fontSize: 32, letterSpacing: 10 }]} 
            value={otp} 
            onChangeText={setOtp} 
            placeholder="0000" 
            keyboardType="number-pad" 
            maxLength={4} 
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyOtp}>
            {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>VERIFY & JOIN →</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- STEP 3: MATCHES/SUCCESS ---
  return (
    <View style={styles.container}>
       <ImageBackground source={require('../../assets/images/wavy_bg.png')} style={StyleSheet.absoluteFillObject} />
       <View style={styles.scrollContent}>
          <Text style={styles.brandText}>SUCCESS!</Text>
          <Text>You are now logged in as {name}.</Text>
       </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FF007F' },
  scrollContent: { padding: 30, alignItems: 'center', flex: 1 },
  heroImg: { width: 300, height: 200, marginBottom: 20, resizeMode: 'contain' },
  brandBox: { backgroundColor: '#CCFF00', padding: 15, borderWidth: 4, borderColor: '#000', marginBottom: 25, transform: [{rotate: '-2deg'}] },
  brandText: { fontSize: 32, fontWeight: '900', color: '#000' },
  instructions: { fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  input: { backgroundColor: '#FFF', width: '100%', padding: 15, borderWidth: 3, borderColor: '#000', marginBottom: 20, fontSize: 18, fontWeight: '800' },
  primaryBtn: { backgroundColor: '#CCFF00', width: '100%', padding: 20, borderWidth: 4, borderColor: '#000', alignItems: 'center', elevation: 8 },
  btnText: { fontWeight: '900', fontSize: 20 }
});