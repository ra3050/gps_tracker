import React, {useState, useEffect, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ScrollView,
} from 'react-native';
import Canvas from 'react-native-canvas'; // 캔버스 그리기를 위한 라이브러리
import Geolocation from '@react-native-community/geolocation'; // GPS 기능을 위한 라이브러리
import {SafeAreaView} from 'react-native-safe-area-context';

// 화면의 너비를 가져와 캔버스 크기를 반응형으로 조정합니다.
const {width: screenWidth} = Dimensions.get('window');
const CANVAS_HEIGHT = 400; // 캔버스의 고정 높이

// 타입 정의
interface Point {
  lat: number;
  lon: number;
}

interface Position {
  coords: {
    latitude: number;
    longitude: number;
  };
}

interface GeoError {
  code: number;
  message: string;
  PERMISSION_DENIED: number;
  POSITION_UNAVAILABLE: number;
  TIMEOUT: number;
}

const HomeScreen = () => {
  // GPS 추적 ID 상태 관리
  const [watchId, setWatchId] = useState<number | null>(null);
  // 경로 지점들을 저장하는 배열 (위도, 경도 객체)
  const [pathPoints, setPathPoints] = useState<Point[]>([]);
  // 총 이동 거리 상태 관리
  const [totalDistance, setTotalDistance] = useState(0);
  // 마지막으로 알려진 GPS 위치 저장
  const [_lastKnownPosition, setLastKnownPosition] = useState<
    Position['coords'] | null
  >(null);
  // 사용자에게 표시할 메시지 상태 관리
  const [message, setMessage] = useState('');
  // 메시지 유형 (정보, 성공, 에러)에 따라 스타일을 변경하기 위한 상태
  const [messageType, setMessageType] = useState<'info' | 'success' | 'error'>(
    'info',
  );

  // Canvas 컴포넌트에 접근하기 위한 Ref
  const canvasRef = useRef<Canvas>(null);
  // Canvas 2D 그리기 컨텍스트를 저장하기 위한 Ref
  const drawingContext = useRef<any>(null);

  const drawPath = useCallback(() => {
    const ctx = drawingContext.current;
    if (!ctx || !canvasRef.current) return;

    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight); // 캔버스 전체 지우기

    if (pathPoints.length === 0) {
      return; // 그릴 경로가 없으면 종료
    }

    // 경로의 최소/최대 위도 및 경도 찾기
    let minLat = pathPoints[0].lat,
      maxLat = pathPoints[0].lat;
    let minLon = pathPoints[0].lon,
      maxLon = pathPoints[0].lon;

    for (const p of pathPoints) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
    }

    ctx.beginPath(); // 새로운 경로 시작
    ctx.strokeStyle = '#007bff'; // 선 색상 (파란색)
    ctx.lineWidth = 4; // 선 두께

    // 첫 번째 지점을 기준으로 경로 시작
    const startCoords = getCanvasCoordinates(
      pathPoints[0],
      minLat,
      maxLat,
      minLon,
      maxLon,
    );
    ctx.moveTo(startCoords.x, startCoords.y);

    // 모든 경로 지점을 연결
    for (let i = 1; i < pathPoints.length; i++) {
      const currentCoords = getCanvasCoordinates(
        pathPoints[i],
        minLat,
        maxLat,
        minLon,
        maxLon,
      );
      ctx.lineTo(currentCoords.x, currentCoords.y);
    }
    ctx.stroke(); // 경로 그리기

    // 시작점에 원 그리기 (녹색)
    ctx.fillStyle = '#28a745';
    ctx.beginPath();
    ctx.arc(startCoords.x, startCoords.y, 6, 0, Math.PI * 2);
    ctx.fill();

    // 경로에 지점이 2개 이상이면 끝점에 원 그리기 (빨간색)
    if (pathPoints.length > 1) {
      const endCoords = getCanvasCoordinates(
        pathPoints[pathPoints.length - 1],
        minLat,
        maxLat,
        minLon,
        maxLon,
      );
      ctx.fillStyle = '#dc3545';
      ctx.beginPath();
      ctx.arc(endCoords.x, endCoords.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [pathPoints, getCanvasCoordinates]);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      canvas.width = screenWidth * 0.95;
      canvas.height = CANVAS_HEIGHT;
      drawingContext.current = canvas.getContext('2d');
      drawPath();
    }
  }, [drawPath]);

  useEffect(() => {
    if (drawingContext.current) {
      drawPath();
    }
  }, [pathPoints, drawPath]);

  // 메시지 표시 시간 관리 (5초 후 사라지도록)
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(''); // 메시지 초기화
      }, 5000);
      return () => clearTimeout(timer); // 컴포넌트 언마운트 시 타이머 정리
    }
  }, [message]); // message 상태가 변경될 때마다 이 효과 실행

  // 도(degree)를 라디안으로 변환하는 헬퍼 함수
  const toRadians = (deg: number): number => (deg * Math.PI) / 180;

  // Haversine 공식을 사용하여 두 위도/경도 지점 간의 거리 계산 (미터 단위)
  const haversineDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number => {
    const R = 6371e3; // 지구의 반지름 (미터)
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const d = R * c; // 미터 단위
    return d;
  };

  // 위도/경도 포인트를 캔버스 좌표로 변환하는 함수
  const getCanvasCoordinates = useCallback(
    (
      point: Point,
      minLat: number,
      maxLat: number,
      minLon: number,
      maxLon: number,
    ): {x: number; y: number} => {
      // 캔버스 너비와 높이를 가져옴 (초기값 1로 설정하여 오류 방지)
      const canvasWidth = canvasRef.current ? canvasRef.current.width : 1;
      const canvasHeight = canvasRef.current ? canvasRef.current.height : 1;

      // 경로 지점이 2개 미만이거나 움직임이 없는 경우 캔버스 중앙에 배치
      if (
        pathPoints.length < 2 ||
        (maxLat - minLat === 0 && maxLon - minLon === 0)
      ) {
        return {x: canvasWidth / 2, y: canvasHeight / 2};
      }

      const latRange = maxLat - minLat;
      const lonRange = maxLon - minLon;

      // 캔버스에 경로가 너무 작게 그려지는 것을 방지하기 위한 최소 범위 설정
      const minEffectiveRange = 0.0001; // 약 10-20 미터에 해당하는 위도/경도 범위
      const effectiveLatRange = Math.max(latRange, minEffectiveRange);
      const effectiveLonRange = Math.max(lonRange, minEffectiveRange);

      // 캔버스에 꽉 차게 그리기 위한 스케일 팩터 계산 (5% 여백)
      const scaleX = (canvasWidth * 0.95) / effectiveLonRange;
      const scaleY = (canvasHeight * 0.95) / effectiveLatRange;
      const scale = Math.min(scaleX, scaleY);

      // 캔버스 중앙에 경로를 배치하기 위한 오프셋 계산
      const renderedWidth = effectiveLonRange * scale;
      const renderedHeight = effectiveLatRange * scale;
      const offsetX = (canvasWidth - renderedWidth) / 2;
      const offsetY = (canvasHeight - renderedHeight) / 2;

      // 위도(y)는 캔버스에서 아래로 갈수록 값이 커지므로, 위도 값을 반전
      const x = (point.lon - minLon) * scale + offsetX;
      const y = (maxLat - point.lat) * scale + offsetY;

      return {x, y};
    },
    [],
  );

  // GPS 위치 성공 콜백 함수
  const successCallback = (position: Position): void => {
    const {latitude, longitude} = position.coords;
    const newPoint = {lat: latitude, lon: longitude};

    setPathPoints(prevPoints => {
      // 이전 지점이 있으면 이전 지점부터 현재 지점까지의 거리 계산
      if (prevPoints.length > 0) {
        const distanceSegment = haversineDistance(
          prevPoints[prevPoints.length - 1].lat,
          prevPoints[prevPoints.length - 1].lon,
          latitude,
          longitude,
        );
        setTotalDistance(prevDist => prevDist + distanceSegment);
      } else {
        setTotalDistance(0); // 첫 번째 지점은 거리 0
      }
      return [...prevPoints, newPoint]; // 새 지점 추가
    });

    setLastKnownPosition(position.coords); // 마지막 위치 업데이트
    setMessage(
      `새로운 위치: 위도 ${latitude.toFixed(5)}, 경도 ${longitude.toFixed(5)}`,
    );
    setMessageType('info');
  };

  // GPS 위치 실패 콜백 함수
  const errorCallback = (error: GeoError): void => {
    let errorMessage = '';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage =
          '위치 정보 권한이 거부되었습니다. 앱 설정에서 위치 접근을 허용해주세요.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage =
          '위치 정보를 사용할 수 없습니다. GPS 신호를 확인하고, 기기를 재시동해보세요.';
        break;
      case error.TIMEOUT:
        errorMessage =
          '위치 정보를 가져오는 시간이 초과되었습니다. 네트워크 연결이 안정적인지 확인하고, GPS 신호가 좋은 곳에서 다시 시도해보세요.';
        break;
      default:
        errorMessage = '알 수 없는 오류가 발생했습니다. 앱을 재시작해보세요.';
        break;
    }
    setMessage(`오류: ${errorMessage}`);
    setMessageType('error');

    // 오류 발생 시 추적 중지 및 버튼 상태 재설정
    if (watchId !== null) {
      Geolocation.clearWatch(watchId);
      setWatchId(null);
    }
  };

  // 추적 시작 함수
  const startTracking = () => {
    if (watchId === null) {
      // Geolocation.watchPosition을 사용하여 위치 추적 시작
      const newWatchId = Geolocation.watchPosition(
        successCallback,
        errorCallback,
        {
          enableHighAccuracy: true, // 고정밀도 요청
          timeout: 5000, // 5초 타임아웃
          maximumAge: 0, // 캐시된 위치 사용 안 함
          distanceFilter: 1, // 1미터 이동 시마다 업데이트
        },
      );
      setWatchId(newWatchId); // watchId 저장
      setMessage('GPS 추적을 시작합니다.');
      setMessageType('success');
    }
  };

  // 추적 중지 함수
  const stopTracking = () => {
    if (watchId !== null) {
      Geolocation.clearWatch(watchId); // 추적 중지
      setWatchId(null); // watchId 초기화
      setMessage('GPS 추적을 중지합니다.');
      setMessageType('info');
    }
  };

  // 경로 지우기 함수
  const clearPath = () => {
    stopTracking(); // 경로 지우기 전에 추적 중지
    setPathPoints([]); // 경로 지점 초기화
    setTotalDistance(0); // 총 거리 초기화
    setLastKnownPosition(null); // 마지막 위치 초기화
    setMessage('경로와 거리를 지웠습니다.');
    setMessageType('info');
  };

  // 메시지 박스 스타일에 따라 동적으로 클래스 적용
  const messageBoxStyle = [
    styles.messageBox,
    messageType === 'error' && styles.messageBoxError,
    messageType === 'success' && styles.messageBoxSuccess,
    messageType === 'info' && styles.messageBoxInfo,
    message ? {} : styles.hidden, // 메시지가 없으면 숨김
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView>
        {/* 메시지 박스 표시 (메시지가 있을 경우에만) */}
        {message ? (
          <View style={messageBoxStyle}>
            <Text style={styles.messageText}>{message}</Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.title}>📍 GPS 경로 추적기</Text>

          <View style={styles.canvasContainer}>
            <Canvas ref={canvasRef} style={styles.canvas} />
          </View>

          <Text style={styles.distanceText}>
            이동 거리:{' '}
            <Text style={styles.distanceValue}>{totalDistance.toFixed(2)}</Text>{' '}
            m
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.startButton,
                watchId !== null && styles.buttonDisabled,
              ]}
              onPress={startTracking}
              disabled={watchId !== null} // 추적 중일 때는 시작 버튼 비활성화
            >
              <Text style={styles.buttonText}>▶️ 추적 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.stopButton,
                watchId === null && styles.buttonDisabled,
              ]}
              onPress={stopTracking}
              disabled={watchId === null} // 추적 중이 아닐 때는 중지 버튼 비활성화
            >
              <Text style={styles.buttonText}>⏹️ 추적 중지</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.clearButton]}
              onPress={clearPath}>
              <Text style={styles.buttonText}>🗑️ 경로 지우기</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.noteText}>
          * 이 앱은 정확한 지도가 아닌 상대적인 이동 경로를 그립니다.
          {'\n'}* GPS 위치 권한이 필요합니다.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

// React Native 스타일 시트 정의 (Tailwind CSS 클래스를 RN 스타일로 변환)
const styles = StyleSheet.create({
  container: {
    flex: 1, // 화면 전체를 차지
    backgroundColor: '#f0f4f8', // 밝은 배경색
    alignItems: 'center', // 가로 중앙 정렬
    justifyContent: 'center', // 세로 중앙 정렬
    padding: 16, // 전체 패딩
  },
  messageBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 16,
    marginBottom: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2, // Android 그림자
    alignSelf: 'stretch', // 부모 너비에 맞춰 확장
    maxWidth: 512, // 최대 너비 설정
  },
  messageBoxInfo: {
    backgroundColor: '#e0f2fe', // blue-100
    borderColor: '#90caf9', // blue-400
  },
  messageBoxSuccess: {
    backgroundColor: '#e8f5e9', // green-100
    borderColor: '#a5d6a7', // green-400
  },
  messageBoxError: {
    backgroundColor: '#ffebee', // red-100
    borderColor: '#ef9a9a', // red-400
  },
  messageText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#374151', // gray-700
  },
  hidden: {
    display: 'none', // 요소 숨김
  },
  card: {
    backgroundColor: '#fff',
    flex: 1,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
    width: '100%',
    maxWidth: screenWidth - 32, // Tailwind의 max-w-lg와 유사
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#374151', // gray-800
    marginBottom: 24,
  },
  canvasContainer: {
    alignItems: 'center', // 캔버스 가로 중앙 정렬
    marginBottom: 24,
  },
  canvas: {
    width: '100%', // 화면 너비의 95%
    height: CANVAS_HEIGHT, // 고정 높이
    borderColor: '#cbd5e1', // slate-300
    borderWidth: 2,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  distanceText: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#4b5563', // gray-700
    marginBottom: 16,
  },
  distanceValue: {
    color: '#2563eb', // blue-600
  },
  buttonContainer: {
    flexDirection: 'row', // 버튼들을 가로로 배치
    flexWrap: 'wrap', // 공간이 부족하면 다음 줄로 감싸기
    justifyContent: 'center', // 버튼들 중앙 정렬
    gap: 16, // 버튼 사이의 간격 (Tailwind의 gap-4와 유사)
    marginBottom: 16,
  },
  button: {
    flex: 1, // flex-1
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    minWidth: 150, // 최소 너비
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  startButton: {
    backgroundColor: '#2563eb', // blue-600
  },
  stopButton: {
    backgroundColor: '#dc2626', // red-600
  },
  clearButton: {
    backgroundColor: '#4b5563', // gray-600
  },
  buttonDisabled: {
    opacity: 0.5, // 비활성화 시 투명도 조절
  },
  noteText: {
    fontSize: 12,
    color: '#6b7280', // gray-500
    textAlign: 'center',
    marginTop: 16,
  },
});

export default HomeScreen; // App 컴포넌트를 기본으로 내보내기
