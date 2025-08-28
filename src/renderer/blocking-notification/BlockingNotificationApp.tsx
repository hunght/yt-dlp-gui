import React, { useState, useEffect } from "react";

interface BlockingNotificationData {
  title: string;
  detail: string;
  userId: string;
  timeEntryId: string;
  appOrDomain: string;
}

const BlockingNotificationApp: React.FC = () => {
  const [notificationData, setNotificationData] = useState<BlockingNotificationData | null>(null);

  useEffect(() => {
    // Listen for blocking notification data from main process
    if ((window as any).electronBlockingNotification) {
      const handleNotification = (data: BlockingNotificationData) => {
        setNotificationData(data);
      };

      (window as any).electronBlockingNotification.onNotification(handleNotification);

      // Add keyboard event listener for Escape key
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          handleClose();
        }
      };

      window.addEventListener("keydown", handleKeyDown);

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      console.error("electronBlockingNotification not available");
      // Set test data for development
      setNotificationData({
        title: "Test Activity Detection",
        detail: "You seem to be using a non-work related application",
        userId: "test-user",
        timeEntryId: "test-entry",
        appOrDomain: "social-media.com",
      });
    }
  }, []);

  const handleResponse = async (response: number) => {
    if ((window as any).electronBlockingNotification) {
      try {
        await (window as any).electronBlockingNotification.respond(response);
      } catch (error) {
        console.error("Failed to send response:", error);
      }
    } else {
    }
  };

  const handleContinueWorking = () => handleResponse(0);
  const handleReturnToFocus = () => handleResponse(1);
  const handleTakeBreak = () => handleResponse(2);

  const handleClose = async () => {
    if ((window as any).electronBlockingNotification) {
      try {
        await (window as any).electronBlockingNotification.close();
      } catch (error) {
        console.error("Failed to send close request:", error);
      }
    } else {
    }
  };

  if (!notificationData) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "rgba(0, 0, 0, 0.8)",
          color: "white",
          fontSize: "18px",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div className="container">
      <div className="notification-card">
        <div className="header">
          <div className="icon">⚠️</div>
          <h1 className="title">Work Activity Alert</h1>
          <p className="subtitle">The app has detected a potentially distracting activity</p>
          <button
            className="close-button"
            onClick={handleClose}
            style={{
              position: "absolute",
              top: "15px",
              right: "15px",
              background: "transparent",
              border: "none",
              color: "white",
              fontSize: "24px",
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <div className="content">
          <div className="activity-info">
            <div className="activity-label">Detected Activity</div>
            <div className="activity-name">{notificationData.title}</div>
          </div>

          <div className="description">{notificationData.detail}</div>

          <div className="description">
            Please choose how you want to proceed with your current activity. Your choice helps us
            better track your work patterns and productivity.
          </div>

          <div className="note">
            <strong>Note:</strong> Your response affects how the app monitors your future
            activities.
          </div>
        </div>

        <div className="buttons">
          <button className="btn btn-primary" onClick={handleContinueWorking}>
            <span className="btn-icon">✓</span>
            Continue Working - This activity is work-related
          </button>

          <button className="btn btn-secondary" onClick={handleReturnToFocus}>
            <span className="btn-icon">🕒</span>
            Return to Focus - Switch back to your primary task
          </button>

          <button className="btn btn-warning" onClick={handleTakeBreak}>
            <span className="btn-icon">⚠️</span>
            Take a Break - Pause tracking for 15 minutes
          </button>
        </div>
      </div>
    </div>
  );
};

export default BlockingNotificationApp;
