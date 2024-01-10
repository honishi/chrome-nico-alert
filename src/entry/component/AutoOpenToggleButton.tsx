import React, { useEffect, useState } from "react";

export enum AutoOpenButtonType {
  FollowPage = "follow-page",
  UserPage = "user-page",
}

export const autoOpenButtonTag = "auto-open";

export default function AutoOpenToggleButton(props: {
  userId: string;
  buttonType: AutoOpenButtonType;
  isOn: boolean;
  onClick: () => Promise<boolean>;
}): React.JSX.Element {
  const [isOn, setState] = useState(props.isOn);
  const onClick = async () => {
    const result = await props.onClick();
    setState(result);
  };

  const buttonRef = React.useRef<HTMLButtonElement>(null);
  useEffect(() => {
    updateButtonStyle(buttonRef, props.buttonType, isOn);
  }, [props.userId, isOn]);

  return <button onClick={onClick} data-tag={autoOpenButtonTag} ref={buttonRef}></button>;
}

function updateButtonStyle(
  buttonRef: React.RefObject<HTMLButtonElement>,
  buttonType: AutoOpenButtonType,
  isOn: boolean,
) {
  const button = buttonRef.current;
  if (button === null) {
    return;
  }
  const onOffString = isOn ? "on" : "off";
  button.className = (() => {
    switch (buttonType) {
      case AutoOpenButtonType.FollowPage:
        return `follow-page-auto-open-${onOffString}-button`;
      case AutoOpenButtonType.UserPage:
        return `user-page-auto-open-${onOffString}-button`;
    }
  })();
  button.innerHTML = isOn ? "自動入場設定中" : "自動入場する";
}
