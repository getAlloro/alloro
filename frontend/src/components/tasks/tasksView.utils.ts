// CSS for pulse animation
export const pulseAnimationStyle = `
  @keyframes task-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(214, 104, 83, 0);
      border-color: rgba(214, 104, 83, 0.2);
    }
    50% {
      box-shadow: 0 0 0 12px rgba(214, 104, 83, 0.15);
      border-color: rgba(214, 104, 83, 0.6);
    }
  }
  .task-pulse-animation {
    animation: task-pulse 0.8s ease-in-out 2;
  }
`;
