import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowserRouter } from "react-router-dom";
import RegisterForm from "../src/components/LoginRegister/LoginForm";
import LoginRegister from "../src/pages/LoginRegister"
import { useAuth, AuthProvider} from "../src/provider/AuthContext";
import { db } from "../src/provider/FirebaseConfig";

//screen.logTestingPlaygroundURL();
describe("RegisterForm Unit Test", () => {

  const renderComponent = () => render(
    <BrowserRouter>
    <AuthProvider>
      <LoginRegister /> {/* 渲染父组件 */}
    </AuthProvider>
  </BrowserRouter>
  );

  // togging the password
  it("Case_Register_1:Input password(*), showing the right string when clicking button, hidden again when clicking agagin", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    const passwordInput = screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i);
    const confirmPasswordInput = screen.getByPlaceholderText(/Re-enter password/i);
    const toggleBtns = screen.getAllByRole('button', { name: /Show password/i });
  

    // Initial status
    expect(passwordInput.type).toBe("password");
    expect(confirmPasswordInput.type).toBe("password");

    // Click button
    fireEvent.click(toggleBtns[0]); 
    expect(passwordInput.type).toBe("text");
    expect(confirmPasswordInput.type).toBe("text");
    
    // Click button again
    fireEvent.click(toggleBtns[0]); 
    expect(passwordInput.type).toBe("password");
    expect(confirmPasswordInput.type).toBe("password");
    });

  // Validate input information
  it("Case_Register_2:Empty email", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();

    });

  // Validate input information
  it("Case_Register_3:Wrong email format", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "abc" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter a valid email address/i)).toBeInTheDocument();

    });

  // Validate input information
  it("Case_Register_4:Empty password", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter and confirm your password/i)).toBeInTheDocument();

    });

  // Validate input information
  it("Case_Register_5:Empty confirm password", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter and confirm your password/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_5:Empty confirm password", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter and confirm your password/i)).toBeInTheDocument();
    });

// Validate input information
  it("Case_Register_6:Confirm password not match", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "123456ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "123456ABD" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_7:Weak password:less characters", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "123ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "123ABC" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Password must be at least 8 characters with letters and numbers/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_8:Weak password:only numbers", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "12345678" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Password must be at least 8 characters with letters and numbers/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_9:Weak password:only letter", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "ABCDEFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "ABCDEFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Password must be at least 8 characters with letters and numbers/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_10:EmptyName", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter your name/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_11:Empty Birthday", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please select your date of birth/i)).toBeInTheDocument();
    });

  // Validate input information
  it("Case_Register_12:Empty Address", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "testUser@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    expect(screen.getByText(/Please enter your address/i)).toBeInTheDocument();
    });

  // Validate account conflicts-member
  it("Case_Register_13:Account same to an exist member", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "emma.w@gmail.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    const errorMessage = await screen.findByText(/An account already exists for this email/i);
    expect(errorMessage).toBeInTheDocument();
    });  

  // Validate account conflicts - staff
  it("Case_Register_14:Account same to an exist staff", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "elena.r@sportcenter.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    const errorMessage = await screen.findByText(/This email belongs to a staff or admin account and cannot be used for member registration/i);
    expect(errorMessage).toBeInTheDocument();
    });  

  // Validate account conflicts - admin
  it("Case_Register_15:Account same to an exist admin", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "sarah.m@sportcenter.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    const errorMessage = await screen.findByText(/This email belongs to a staff or admin account and cannot be used for member registration/i);
    expect(errorMessage).toBeInTheDocument();
    });  

  // Validate account conflicts - admin
  it("Case_Register_16:Register success", async () => {
    renderComponent();
  
    const registerTab = screen.getByRole("button", { name: /Register/i });
    fireEvent.click(registerTab);
    expect(await screen.findByPlaceholderText(/Re-enter password/i)).toBeInTheDocument();

    // input
    fireEvent.change(screen.getByPlaceholderText(/example@mail.com/i), { target: { value: "NewUser@test.com" } });
    fireEvent.change(screen.getByPlaceholderText(/At least 8 characters with letters and numbers/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Re-enter password/i), { target: { value: "1234EFGH" } });
    fireEvent.change(screen.getByPlaceholderText(/Your name/i), { target: { value: "TestUser" } });
    fireEvent.change(screen.getByPlaceholderText(/yyyy-mm-dd/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByPlaceholderText(/Street, City/i), { target: { value: "southampton" } });

    // action
    fireEvent.click(screen.getByRole("button", { name: /Submit/i }));

    // expectation
    const errorMessage = await screen.findByText(/Verification email sent/i);
    expect(errorMessage).toBeInTheDocument();
    });  

    
});