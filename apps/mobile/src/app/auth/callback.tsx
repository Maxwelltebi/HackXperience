import { Redirect } from 'expo-router';

/**
 * If Android opens the OAuth deep link as a route instead of handing it back to the
 * in-app browser, continue to the app. The session exchange happens in signIn().
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
