# Samsung AC Control System v2.0

ND032WHXB1 및 호환 삼성 시스템 에어컨을 위한 현대적인 웹 제어 시스템입니다.

## 특징

- **RS-485 (NonNASA 프로토콜)** - 삼성 시스템 에어컨의 F3/F4 버스와 직접 통신
- **TCP 게이트웨이 지원** - Waveshare 등 RS485-to-Ethernet 변환기와 연결
- **시뮬레이션 모드** - 실제 장비 없이도 UI 테스트 가능
- **실시간 업데이트** - WebSocket을 통한 상태 자동 갱신
- **반응형 UI** - PC, 태블릿, 모바일 모두 지원
- **다중 기기 제어** - 기숙사/건물 내 여러 대의 에어컨 관리

## 설치 및 실행

### 1. Node.js 설치

https://nodejs.org 에서 LTS 버전을 다운로드하여 설치하세요.

### 2. 패키지 설치

```bash
npm install
```

### 3. 설정 (config.js)

```javascript
// config.js 수정
connection: {
  type: 'tcp',    // 'tcp': TCP 게이트웨이, 'mock': 시뮬레이션
  tcp: {
    host: '192.168.1.100',  // RS485-to-Ethernet 변환기 IP
    port: 4196               // 포트 (기본 4196)
  },
  ...
}

devices: [
  { id: 1, name: '101호', address: 0x01, enabled: true },
  { id: 2, name: '102호', address: 0x02, enabled: true },
  ...
]
```

### 4. 실행

```bash
npm start
```

### 5. 접속

브라우저에서 http://localhost:3000 으로 접속합니다.

## 시뮬레이션 모드 (테스트용)

실제 에어컨 없이 UI를 테스트하려면 `config.js`에서 `connection.type`을 `'mock'`으로 설정하세요.
가상의 에어컨 상태가 시뮬레이션됩니다.

## 하드웨어 연결

### RS-485 연결 (F3/F4 버스)

```
삼성 에어컨 실내기          RS485-to-Ethernet 변환기
F3 (통신 A(+)) ──────────── A(+)
F4 (통신 B(-)) ──────────── B(-)
```

- Waveshare RS485-to-Ethernet 또는 유사 장비 사용
- 기본 통신 설정: 2400 baud, 8E1 (8데이터비트, Even 패리티, 1스톱비트)

## API

### GET /api/devices
모든 기기 상태 조회

### GET /api/device/:id
특정 기기 상태 조회

### POST /api/device/:id/control
기기 제어 명령 전송
```json
{
  "power": "on",
  "mode": "cool",
  "temperature": 24,
  "fanSpeed": "auto"
}
```

### POST /api/device/:id/refresh
특정 기기 상태 새로고침

## 프로토콜 참고

- NonNASA 프로토콜: 14바이트 고정 패킷, 2400bps 8E1
- NASA 프로토콜: 최대 1500바이트 가변 패킷, 최소 16바이트
- 상세: https://github.com/DannyDeGaspari/Samsung-HVAC-buscontrol
