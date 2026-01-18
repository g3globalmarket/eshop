let redirectToLogin = () => {
    // Guard against SSR - window only exists in browser
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  };
  
  export const setRedirectHandler = (handler: () => void) => {
    redirectToLogin = handler;
  };
  
  export const runRedirectToLogin = () => {
    redirectToLogin();
  };
  
  
  