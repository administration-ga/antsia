import play from "../../assets/icons/play.png"
import video from "../../assets/icons/video.png"
import shield from "../../assets/icons/shield.png"
import mail from "../../assets/icons/mail.png"
import phone from "../../assets/icons/phone.png"
import key from "../../assets/icons/key.png"
import arrowRight from "../../assets/icons/arrow-right.png"
import logOut from "../../assets/icons/log-out.png"
import info from "../../assets/icons/info.png"
import check from "../../assets/icons/check.png"
import users from "../../assets/icons/users.png"
import store from "../../assets/icons/store.png"
import flag from "../../assets/icons/flag.png"
import more from "../../assets/icons/more.png"
import { Image, type ImageSourcePropType } from "react-native"
import { useNativeAppearance } from "../appearance"
import home from "../../assets/icons/home.png"
import compass from "../../assets/icons/compass.png"
import plus from "../../assets/icons/plus.png"
import messages from "../../assets/icons/messages.png"
import user from "../../assets/icons/user.png"
import search from "../../assets/icons/search.png"
import bell from "../../assets/icons/bell.png"
import menu from "../../assets/icons/menu.png"
import back from "../../assets/icons/back.png"
import heart from "../../assets/icons/heart.png"
import comment from "../../assets/icons/comment.png"
import share from "../../assets/icons/share.png"
import bookmark from "../../assets/icons/bookmark.png"
import refresh from "../../assets/icons/refresh.png"
import grid from "../../assets/icons/grid.png"
import list from "../../assets/icons/list.png"
import settings from "../../assets/icons/settings.png"
import close from "../../assets/icons/close.png"
import sun from "../../assets/icons/sun.png"
import moon from "../../assets/icons/moon.png"
import image from "../../assets/icons/image.png"
import send from "../../assets/icons/send.png"

// Rasterized from the same Lucide paths as the Web app, at 3x; no extra native module.
const sources: Record<NativeIconName, ImageSourcePropType> = {
  "play": play,
  "video": video,
  "shield": shield,
  "mail": mail,
  "phone": phone,
  "key": key,
  "arrow-right": arrowRight,
  "log-out": logOut,
  "info": info,
  "check": check,
  "users": users,
  "store": store,
  "flag": flag,
  "more": more,
  home, compass,
  plus, messages,
  user, search,
  bell, menu,
  back, heart,
  comment, share,
  bookmark, refresh,
  grid, list,
  settings, close,
  sun, moon,
  image, send,
}
export type NativeIconName = "play" | "video" | "shield" | "mail" | "phone" | "key" | "arrow-right" | "log-out" | "info" | "check" | "users" | "store" | "flag" | "more" | "home" | "compass" | "plus" | "messages" | "user" | "search" | "bell" | "menu" | "back" | "heart" | "comment" | "share" | "bookmark" | "refresh" | "grid" | "list" | "settings" | "close" | "sun" | "moon" | "image" | "send"
export function NativeIcon({ name, size = 24, color }: { name: NativeIconName; size?: number; color?: string }) {
  const { tokens } = useNativeAppearance()
  return <Image source={sources[name]} alt="" accessible={false} accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, tintColor: color ?? tokens.foreground }} />
}
