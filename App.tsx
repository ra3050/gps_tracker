import React from 'react';
import {View} from 'react-native';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import WebView from 'react-native-webview';

const gpsTracker = require('./src/webview/index.html');

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{flex: 1}}>
        <View style={{flex: 1}}>
          <WebView
            source={gpsTracker}
            originWhitelist={['file://*', 'http://*', 'https://*']}
          />
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
