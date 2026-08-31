package com.globalaffairs.handover.account;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.globalaffairs.handover.web.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** The rules behind the messages the login screen shows. */
class CredentialsTest {

    @Test
    void acceptsAnEmployeeNumberOfDigitsAndTrimsIt() {
        assertThat(Credentials.employeeId("  20190002 ")).isEqualTo("20190002");
    }

    @ParameterizedTest
    @ValueSource(strings = {"a20190002", "2019-0002", "2019 0002", "２０１９"})
    void refusesAnythingButDigits(String value) {
        assertThatThrownBy(() -> Credentials.employeeId(value))
                .isInstanceOf(ApiException.class)
                .hasMessage("직번은 숫자만 입력할 수 있습니다.");
    }

    @Test
    void asksForAnEmployeeNumberWhenTheFieldIsEmpty() {
        assertThatThrownBy(() -> Credentials.employeeId("  "))
                .isInstanceOf(ApiException.class)
                .hasMessage("직번을 입력해 주세요.");
    }

    @Test
    void lowercasesTheEmailBecauseItKeysTheStoredDocument() {
        assertThat(Credentials.email(" Kim@Example.AC.KR ")).isEqualTo("kim@example.ac.kr");
    }

    @ParameterizedTest
    @ValueSource(strings = {"kim", "kim@example", "kim @example.ac.kr", "@example.ac.kr"})
    void refusesAnAddressThatCouldNotReceiveTheResetMail(String value) {
        assertThatThrownBy(() -> Credentials.email(value))
                .isInstanceOf(ApiException.class)
                .hasMessage("이메일 주소 형식이 올바르지 않습니다.");
    }

    @Test
    void refusesAPasswordShorterThanTheMinimum() {
        assertThatThrownBy(() -> Credentials.newPassword("short12", "20190002"))
                .isInstanceOf(ApiException.class)
                .hasMessage("비밀번호는 8자 이상이어야 합니다.");
    }

    @Test
    void refusesTheEmployeeNumberAsItsOwnPassword() {
        assertThatThrownBy(() -> Credentials.newPassword("201900021234", "201900021234"))
                .isInstanceOf(ApiException.class)
                .hasMessage("직번과 같은 비밀번호는 사용할 수 없습니다.");
    }

    @Test
    void refusesAPasswordMadeOfOneRepeatedCharacter() {
        assertThatThrownBy(() -> Credentials.newPassword("aaaaaaaaaa", "20190002"))
                .isInstanceOf(ApiException.class)
                .hasMessage("같은 문자만으로 이루어진 비밀번호는 사용할 수 없습니다.");
    }

    @Test
    void keepsEnoughOfTheAddressToRecogniseTheInboxAndNoMore() {
        assertThat(Credentials.mask("minseo.park@example.ac.kr")).isEqualTo("m***@e***.kr");
    }
}
