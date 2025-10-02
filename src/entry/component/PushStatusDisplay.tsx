import React, { useState, useEffect } from "react";
import { PushStatus } from "../../domain/model/push-status";
import { getPushStatus } from "../utils/push-status";

const PushStatusDisplay: React.FC = () => {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const pushStatus = await getPushStatus();
        setStatus(pushStatus);
        setError(false);
      } catch (err) {
        console.error("Failed to get push status:", err);
        setError(true);
      }
    };

    // Initial fetch
    fetchStatus();

    // Update status every 5 seconds
    const interval = setInterval(fetchStatus, 5000);

    // Cleanup
    return () => clearInterval(interval);
  }, []);

  if (error) {
    return (
      <div className="push-status-container">
        <div id="push-status" className="push-status">
          <span className="push-status-error">⚠️ プッシュ通知: エラー</span>
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="push-status-container">
        <div id="push-status" className="push-status">
          <span className="push-status-loading">読み込み中...</span>
        </div>
      </div>
    );
  }

  let statusText = "プッシュ通知: 無効";
  let statusClass = "push-status-disabled";

  if (status.enabled && status.connected) {
    statusText = "プッシュ通知: 接続済み";
    statusClass = "push-status-connected";
  } else if (status.enabled && !status.connected) {
    statusText = "プッシュ通知: 未接続";
    statusClass = "push-status-disconnected";
  }

  // Build tooltip details
  const details: string[] = [];
  if (status.connectionState) {
    details.push(`Connection Status: ${status.connectionState}`);
  }
  if (status.uaid) {
    details.push(`UAID: ${status.uaid}`);
  }
  if (status.channelId) {
    details.push(`Channel ID: ${status.channelId}`);
  }
  if (status.connectionStatus) {
    details.push(
      `Connection Rate Limit: ${status.connectionStatus.currentAttempts}/${status.connectionStatus.maxAttempts}`,
    );
    if (status.connectionStatus.lastAttemptTime) {
      const lastAttempt = new Date(status.connectionStatus.lastAttemptTime);
      details.push(`Last Connection Attempt: ${lastAttempt.toLocaleString("ja-JP")}`);
    }
    if (status.connectionStatus.lastConnectedTime) {
      const lastConnection = new Date(status.connectionStatus.lastConnectedTime);
      details.push(`Last Connected At: ${lastConnection.toLocaleString("ja-JP")}`);
    }
  }

  // Add last received program info to tooltip
  if (status.lastReceivedProgram) {
    const lastReceived = new Date(status.lastReceivedProgram.receivedAt);
    const now = new Date();
    const diffMs = now.getTime() - lastReceived.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    let timeText = "";
    if (diffMinutes < 60) {
      timeText = `${diffMinutes}m ago`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      timeText = `${diffHours}h ago`;
    }

    // Extract broadcaster name from title (format: "XXXさんが生放送を開始")
    const titleMatch = status.lastReceivedProgram.program.title.match(/(.+)さんが生放送を開始/);
    const displayTitle = titleMatch ? titleMatch[1] : status.lastReceivedProgram.program.title;

    // Format full date/time
    const year = lastReceived.getFullYear();
    const month = String(lastReceived.getMonth() + 1).padStart(2, "0");
    const day = String(lastReceived.getDate()).padStart(2, "0");
    const hours = String(lastReceived.getHours()).padStart(2, "0");
    const minutes = String(lastReceived.getMinutes()).padStart(2, "0");
    const seconds = String(lastReceived.getSeconds()).padStart(2, "0");
    const fullDateTime = `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;

    details.push(
      `Latest Program: [${displayTitle}] ${status.lastReceivedProgram.program.body} (${timeText})`,
    );
    details.push(`Program Detected Time: ${fullDateTime}`);
  } else {
    details.push(`Latest Program: N/A`);
  }

  const tooltipText = details.length > 0 ? details.join("\n") : undefined;

  return (
    <div className="push-status-container">
      <div id="push-status" className="push-status">
        <span className={statusClass} title={tooltipText}>
          <i className="fa-solid fa-circle push-status-icon"></i> {statusText}
        </span>
      </div>
    </div>
  );
};

export default PushStatusDisplay;
