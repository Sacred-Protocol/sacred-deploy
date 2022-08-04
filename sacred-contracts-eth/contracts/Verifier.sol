// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

library Pairing {
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    struct G1Point {
        uint256 X;
        uint256 Y;
    }

    // Encoding of field elements is: X[0] * z + X[1]
    struct G2Point {
        uint256[2] X;
        uint256[2] Y;
    }

    /*
     * @return The negation of p, i.e. p.plus(p.negate()) should be zero
     */
    function negate(G1Point memory p) internal pure returns (G1Point memory) {
        // The prime q in the base field F_q for G1
        if (p.X == 0 && p.Y == 0) {
            return G1Point(0, 0);
        } else {
            return G1Point(p.X, PRIME_Q - (p.Y % PRIME_Q));
        }
    }

    /*
     * @return r the sum of two points of G1
     */
    function plus(
        G1Point memory p1,
        G1Point memory p2
    ) internal view returns (G1Point memory r) {
        uint256[4] memory input = [
            p1.X, p1.Y,
            p2.X, p2.Y
        ];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 6, input, 0xc0, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-add-failed");
    }

    /*
     * @return r the product of a point on G1 and a scalar, i.e.
     *         p == p.scalarMul(1) and p.plus(p) == p.scalarMul(2) for all
     *         points p.
     */
    function scalarMul(G1Point memory p, uint256 s) internal view returns (G1Point memory r) {
        uint256[3] memory input = [p.X, p.Y, s];
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 7, input, 0x80, r, 0x60)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-mul-failed");
    }

    /* @return The result of computing the pairing check
     *         e(p1[0], p2[0]) *  .... * e(p1[n], p2[n]) == 1
     *         For example,
     *         pairing([P1(), P1().negate()], [P2(), P2()]) should return true.
     */
    function pairing(
        G1Point memory a1,
        G2Point memory a2,
        G1Point memory b1,
        G2Point memory b2,
        G1Point memory c1,
        G2Point memory c2,
        G1Point memory d1,
        G2Point memory d2
    ) internal view returns (bool) {
        uint256[24] memory input = [
            a1.X, a1.Y, a2.X[0], a2.X[1], a2.Y[0], a2.Y[1],
            b1.X, b1.Y, b2.X[0], b2.X[1], b2.Y[0], b2.Y[1],
            c1.X, c1.Y, c2.X[0], c2.X[1], c2.Y[0], c2.Y[1],
            d1.X, d1.Y, d2.X[0], d2.X[1], d2.Y[0], d2.Y[1]
        ];
        uint256[1] memory out;
        bool success;

        // solium-disable-next-line security/no-inline-assembly
        assembly {
            success := staticcall(sub(gas(), 2000), 8, input, mul(24, 0x20), out, 0x20)
            // Use "invalid" to make gas estimation work
            switch success case 0 { invalid() }
        }

        require(success, "pairing-opcode-failed");
        return out[0] != 0;
    }
}

contract Verifier {
    uint256 constant SNARK_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 constant PRIME_Q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    using Pairing for *;

    struct VerifyingKey {
        Pairing.G1Point alfa1;
        Pairing.G2Point beta2;
        Pairing.G2Point gamma2;
        Pairing.G2Point delta2;
        Pairing.G1Point[7] IC;
    }

    function verifyingKey() internal pure returns (VerifyingKey memory vk) {
        vk.alfa1 = Pairing.G1Point(uint256(3124328553622115111704218339358699513097328793808894497341450362346809493263), uint256(8998677956426798201916731922054426965712017607557874538097961826997446106177));
        vk.beta2 = Pairing.G2Point([uint256(10089191550512665569826157192532383667318187098366212921403644464952403037255), uint256(4423715772034787689724214155588810878460468742443500863605104668264594840485)], [uint256(7803380715684527210437159101881387258672725465944042864190102604386412103381), uint256(8856022782709331473548017394720566861747764208621507421583002644505863873011)]);
        vk.gamma2 = Pairing.G2Point([uint256(7193120751075533109329508037723047109801263184684986850433953613902265867781), uint256(1659720698540258828093828338707712329138912620193470803590370136200572278309)], [uint256(7084268075416370903857797568067817456538969772389878686808346905030325713513), uint256(20546873386758018847549994753088572530865912629014827831423913817347984240665)]);
        vk.delta2 = Pairing.G2Point([uint256(21327230987617024967116808539571010359226928478385726127958912222181729892399), uint256(8800218032888094876288221049232802291715660456116585665395037161008288323386)], [uint256(19577899530465889657208025469724917065677877390226687192717437941782599840220), uint256(12068726072963744682514971138035962559897530322618883627242051441826797067553)]);
        vk.IC[0] = Pairing.G1Point(uint256(15383605729173440164906691396950589544801957147040348244497772523454017999088), uint256(21684279675336357716977229578942960936924386689538294694949961364792939349226));
        vk.IC[1] = Pairing.G1Point(uint256(16720993202690652699599269428126748009883928607376815886184019907814291051736), uint256(11115486084013827051402715814109268198043179059292727162422789422978451508419));
        vk.IC[2] = Pairing.G1Point(uint256(9309182746231257941003431126106505785882962346886433957694689956072020965838), uint256(3812392372562880689734372422752537433854789277004405287676018513736123773652));
        vk.IC[3] = Pairing.G1Point(uint256(6024426369522884717994222255989361690473335858281358887911552286977247771874), uint256(6448494149610035424280606317540027246553527506114512044792640715263911724559));
        vk.IC[4] = Pairing.G1Point(uint256(14072978207556916715326225295651768565180816241602786983630406939164953712347), uint256(800420616828834886655956384874473496553801273979057430315126890664669248151));
        vk.IC[5] = Pairing.G1Point(uint256(20465490612989002909357899150450855034929693861527084030309342277927603884832), uint256(1834917359097747803014632037760985077720102650945368967751094922698797550486));
        vk.IC[6] = Pairing.G1Point(uint256(8970919535712885673288449506787661100608933586530953424413161420907793997307), uint256(4303806274908460021082814270901204587333764216675047107427803066948610510417));

    }

    /*
     * @returns Whether the proof is valid given the hardcoded verifying key
     *          above and the public inputs
     */
    function verifyProof(
        bytes memory proof,
        uint256[6] memory input
    ) public view returns (bool) {
        uint256[8] memory p = abi.decode(proof, (uint256[8]));
        for (uint8 i = 0; i < p.length; i++) {
            // Make sure that each element in the proof is less than the prime q
            require(p[i] < PRIME_Q, "verifier-proof-element-gte-prime-q");
        }
        Pairing.G1Point memory proofA = Pairing.G1Point(p[0], p[1]);
        Pairing.G2Point memory proofB = Pairing.G2Point([p[2], p[3]], [p[4], p[5]]);
        Pairing.G1Point memory proofC = Pairing.G1Point(p[6], p[7]);

        VerifyingKey memory vk = verifyingKey();
        // Compute the linear combination vkX
        Pairing.G1Point memory vkX = vk.IC[0];
        for (uint256 i = 0; i < input.length; i++) {
            // Make sure that every input is less than the snark scalar field
            require(input[i] < SNARK_SCALAR_FIELD, "verifier-input-gte-snark-scalar-field");
            vkX = Pairing.plus(vkX, Pairing.scalarMul(vk.IC[i + 1], input[i]));
        }

        return Pairing.pairing(
            Pairing.negate(proofA),
            proofB,
            vk.alfa1,
            vk.beta2,
            vkX,
            vk.gamma2,
            proofC,
            vk.delta2
        );
    }
}

