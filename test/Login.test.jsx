import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import LoginForm from "../src/components/LoginRegister/LoginForm";
import { useAuth, AuthProvider} from "../src/provider/AuthContext";
import { db } from "../src/provider/FirebaseConfig";
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  query, 
  where 
} from "firebase/firestore";

//screen.logTestingPlaygroundURL();
describe("LoginForm Unit Test", () => {

  const renderComponent = () => render(
  <BrowserRouter>
    <AuthProvider> 
        <LoginForm />
    </AuthProvider>
  </BrowserRouter>
  );

  // togging the password
  it("Case_Login_1:Input password(*), showing the right string when clicking button, hidden again when clicking agagin", () => {
    renderComponent();
    const passwordInput = screen.getByPlaceholderText(/Enter your password/i);
    const toggleBtn = screen.getByLabelText(/Show password/i);

    // Initial status
    expect(passwordInput.type).toBe("password");

    // Click button
    fireEvent.click(toggleBtn);
    expect(passwordInput.type).toBe("text");

    // Click button again
    fireEvent.click(screen.getByLabelText(/Hide password/i));
    expect(passwordInput.type).toBe("password");
  });

  // Validate : empty email input
  it("Case_Login_2:Empty email", async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(screen.getByText(/Please enter both email and password/i)).toBeInTheDocument();
  });

  // Validate : empty password input
  it("Case_Login_3:Empty password", async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "abc" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(screen.getByText(/Please enter both email and password/i)).toBeInTheDocument();
  });

  // Validate : wrong email format
  it("Case_Login_4:Invalid email format", async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "abcdef" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    expect(screen.getByText(/Please enter a valid email address before signing in/i)).toBeInTheDocument();
  });

  // Validate : non existing account 
  it("Case_Login_5:Non existing account or wrong password", async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "notexist@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    const errorMessage = await screen.findByText(/Invalid email or password/i);
    expect(errorMessage).toBeInTheDocument();
  });

  // Validate : wrong password
  it("Case_Login_6:Non existing account or wrong password", async () => {
    renderComponent();
    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "emma.w@gmail.comm" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "12345678" } });
    
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    const errorMessage = await screen.findByText(/Invalid email or password/i);
    expect(errorMessage).toBeInTheDocument();
  });


  // Validate : Role
  it("Case_Login_7:Role select as Member, the account is not member, but valid", async () => {
    renderComponent();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Member' } });
    expect(select.value).toBe('Member');

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "AWhite@sportcenter.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    const errorMessage = await screen.findByText(/Selected identity does not match this account/i);
    expect(errorMessage).toBeInTheDocument();
  });

  it("Case_Login_8:Role select as Staff, the account is not staff, but valid", async () => {
    renderComponent();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Staff' } });
    expect(select.value).toBe('Staff');

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "bob@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));

    const errorMessage = await screen.findByText(/Selected identity does not match this account/i);
    expect(errorMessage).toBeInTheDocument();
  });

  it("Case_Login_9:Role select as Admin, the account is not admin, but valid", async () => {
    renderComponent();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Admin' } });
    expect(select.value).toBe('Admin');

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "david.c@sportcenter.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    const errorMessage = await screen.findByText(/Selected identity does not match this account/i);
    expect(errorMessage).toBeInTheDocument();
  });

  // Validate : If the email is verified or not
  it("Case_Login_10:Non Verified Email", async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "nonverify@test.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    const errorMessage = await screen.findByText(/Please verify your email before signing in/i);
    expect(errorMessage).toBeInTheDocument();
  });

  // Validate : If the account is not active
  it("Case_Login_11:Non Active Email", async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "noactive@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    const errorMessage = await screen.findByText(/This account has been suspended or deactivated by an administrator/i);
    expect(errorMessage).toBeInTheDocument();
  });

  // Validate : Success login, if navigate to the right page
  it("Case_Login_12:Member success login", async () => {
    renderComponent();

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "emma.w@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    await waitFor(() => {
    expect(window.location.pathname).toBe("/facilities"); 
    });
  });

  it("Case_Login_13:Staff success login", async () => {
    renderComponent();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Staff' } });
    expect(select.value).toBe('Staff');

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "elena.r@sportcenter.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    await waitFor(() => {
    expect(window.location.pathname).toBe("/staff/requests"); 
    });
  });

  it("Case_Login_14:Admin success login", async () => {
    renderComponent();

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Admin' } });
    expect(select.value).toBe('Admin');

    fireEvent.change(screen.getByPlaceholderText(/Enter your account email/i), { target: { value: "sarah.m@sportcenter.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Enter your password/i), { target: { value: "123456" } });

    fireEvent.click(screen.getByRole("button", { name: /Sign in/i }));
    
    await waitFor(() => {
    expect(window.location.pathname).toBe("/admin/facilities"); 
    });
  });


});