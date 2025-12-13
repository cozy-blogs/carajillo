let recaptchaSiteKey = null;

async function main() {
  await domReady();
  try {
    recaptchaSiteKey = await getCaptchaSiteKey();
    await loadCaptcha(recaptchaSiteKey);
    await subscribe();
  } catch (error) {
    document.querySelectorAll(".subscribe-form").forEach(function(form) {
      const status = form.querySelector(".subscribe-status");
      status.innerText = `🙈 ${error.message}`;
    });
  }
}

function domReady() {
  return new Promise((resolve) => {
    if (document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", () => { resolve(document); })
    else
      resolve(document);
  });
}

async function subscribe() {
  document.querySelectorAll(".subscribe-form").forEach(function(form) {
    //if (new URL(form.action).hostname === "app.loops.so") 
      loopsSubscribeForm(form);
  });
}

async function getCaptchaSiteKey() {
  // @todo CORS
  const response = await fetch('/.netlify/functions/recaptcha', {
    'Method': 'GET',
    'Accept': 'application/json',
  });
  if (response.ok) {
    const data = await response.json();
    if (typeof data.recaptcha_site_key !== 'string')
      throw new Error("Cannot retrieve reCAPTCHA site key");
    return data.recaptcha_site_key;
  } else {
    throw new Error("Cannot retrieve reCAPTCHA site key");
  }
}

function loadCaptcha(siteKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.addEventListener('load', resolve);
    script.addEventListener('error', reject);
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.defer = true;
    script.async = true;
    document.head.appendChild(script);
  });
}

function getCaptchaToken(action){
  return new Promise((resolve) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(recaptchaSiteKey, {action}).then(resolve);
    });
  });
}

function loopsSubscribeForm(form) {
  const status = form.querySelector(".subscribe-status");
  form.addEventListener("submit", async function(event) {
    event.preventDefault();
    form.dataset.status = "in-progress";
    status.innerHTML = "<progress/>";


    const {success, message, email} = await loopsSubscribe(form);
    if (success) {
      form.dataset.status = "successful";
      const confirmationLink = document.createElement("a");
      confirmationLink.href = confirmLink(email);
      confirmationLink.target = "_blank";
      confirmationLink.innerText = message;
      status.replaceChildren(confirmationLink);
    } else {
      form.dataset.status = "failed";
      status.innerText = message;
    }
  });
}

function formDataObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// https://loops.so/docs/forms/custom-form
async function loopsSubscribe(form) {
  const messages = {
    success: form.dataset.i18nSuccess || "Subscription successful. Check your email for confirmation.",
    tryLater: form.dataset.i18nTryLater || "Too many signups, please try again in a little while.",
    failed: form.dataset.i18nFailed || "Subscription failed: {message}",
  };

  const data = formDataObject(form);
  data.captcha_token = await getCaptchaToken('subscribe');

  try {
    const response = await fetch(form.action, {
      method: "POST",
      body: JSON.stringify(data),
      //body: new URLSearchParams(new FormData(form)),
      headers: {
        //"Content-Type": "application/x-www-form-urlencoded",
        "Content-Type": "application/json",
        "Accept": "application/json",
      }
    });
    if (response.status == 429) {
      return {success: false, message: `⏳ ${messages.tryLater}`};
    }
    const result = await response.json();
    if (result.success) {
      return {success: true, message: `📨 ${messages.success}`, email: data.email};
    } else {
      return {success: false, message: `❌ ${messages.failed.replace("{message}", result.error)}`};
    }
  } catch(error) {
    return {success: false, message: `❌ ${messages.failed.replace("{message}", error.message)}`};
  }
}

function confirmLink(email) {
  const domain = email.replace(/.*@/, "");
  return `https://${domain}/`;
}

main();