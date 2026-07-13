import { useEffect, useState } from 'react';
import './App.css';

// Mock Abilities
const abilities = [
  { id: 'q', name: 'Slash', icon: '⚔️', cooldown: 0 },
  { id: 'e', name: 'Dash', icon: '💨', cooldown: 3 },
  { id: 'r', name: 'Ultimate', icon: '🔥', cooldown: 15 },
];

function App() {
  const [towerHealth, setTowerHealth] = useState(1000);
  const [maxTowerHealth] = useState(1000);
  const [wsStatus, setWsStatus] = useState('Connecting...');

  useEffect(() => {
    // Connect to the CS2 Game Server WebSocket
    const ws = new WebSocket('ws://127.0.0.1:8080');

    ws.onopen = () => {
      setWsStatus('Connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Handle damage to tower
        if (data.EventType === 'PlayerHurt') {
          // In a real scenario, check if the VictimSteamID matches the tower entity ID or name
          // For now, simulate tower taking damage
          setTowerHealth((prev) => Math.max(0, prev - data.Damage));
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message', err);
      }
    };

    ws.onclose = () => {
      setWsStatus('Disconnected');
    };

    return () => ws.close();
  }, []);

  const healthPercent = (towerHealth / maxTowerHealth) * 100;

  return (
    <div className="overlay-container">
      {/* Top Center: Tower Health */}
      <div className="tower-health-container">
        <div className="tower-health-title">TOWER HEALTH</div>
        <div className="tower-health-bar-bg">
          <div 
            className="tower-health-bar-fill" 
            style={{ width: `${healthPercent}%`, backgroundColor: healthPercent > 30 ? '#10b981' : '#ef4444' }}
          ></div>
        </div>
        <div className="tower-health-text">{towerHealth} / {maxTowerHealth}</div>
      </div>

      {/* Connection Status */}
      <div className="ws-status">
        CS2 Server: <span className={wsStatus === 'Connected' ? 'online' : 'offline'}>{wsStatus}</span>
      </div>

      {/* Bottom Center: Hotbar */}
      <div className="hotbar-container">
        {abilities.map((ability) => (
          <div key={ability.id} className={`ability-slot ${ability.cooldown > 0 ? 'on-cooldown' : ''}`}>
            <div className="ability-icon">{ability.icon}</div>
            <div className="ability-key">{ability.id.toUpperCase()}</div>
            {ability.cooldown > 0 && <div className="cooldown-overlay">{ability.cooldown}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
