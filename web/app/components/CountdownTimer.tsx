"use client";

import { memo, useEffect, useState } from "react";
import { getNowInTimeZone, formatCountdown } from "@/lib/timezone";

interface CountdownTimerProps {
  targetTime: Date;
  tz: string;
}

/**
 * 倒计时组件：每秒刷新一次（客户端渲染）
 */
function CountdownTimer({ targetTime, tz }: CountdownTimerProps) {
  const [remaining, setRemaining] = useState(() => {
    const now = getNowInTimeZone(tz);
    return targetTime.getTime() - now.getTime();
  });

  useEffect(() => {
    const tick = () => {
      const now = getNowInTimeZone(tz);
      setRemaining(targetTime.getTime() - now.getTime());
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [targetTime, tz]);

  return <span className="tabular-nums">{formatCountdown(remaining)}</span>;
}

export default memo(CountdownTimer);
