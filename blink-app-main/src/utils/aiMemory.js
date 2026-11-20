let lastTopic = null;

export const setLastTopic = (topic) => {
  lastTopic = topic;
};

export const getLastTopic = () => lastTopic;